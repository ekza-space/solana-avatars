#![allow(unexpected_cfgs)] // TODO: wtf?!
use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke,
        system_instruction,
    },
};

use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::{
            self,
            types::{Creator, DataV2},
        },
        CreateMetadataAccountsV3, Metadata,
    },
    token::{
        mint_to, set_authority, spl_token::instruction::AuthorityType, Mint, MintTo, SetAuthority,
        Token, TokenAccount,
    },
};
use sha2::{Digest, Sha256};

declare_id!("29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz");

#[constant]
const AVATAR_SEED: &[u8] = b"avatar_v1";

#[constant]
const ESCROW_SEED: &[u8] = b"avatar_escrow";

#[constant]
const STELLAR_LINK_SEED: &[u8] = b"stellar_avatar_link";

const SOLANA_STELLAR_PROGRAM_ID: Pubkey = pubkey!("3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA");
const RELEASE_VAULT_OFFSET: usize = 8 + 32 + 32;
const RELEASE_STATUS_OFFSET: usize = 8 + 32 + 32 + 32 + 8 + 32;
const RELEASE_STATUS_FINALIZED: u8 = 1;
const RELEASE_STATUS_LINKED: u8 = 2;

#[account]
pub struct Escrow {
    pub bump: u8,
}

impl Escrow {
    pub const INIT_SPACE: usize = 1;
}

#[account]
pub struct AvatarRegistry {
    pub next_index: u64,
    pub bump: u8,
}

#[account]
pub struct StellarAvatarLink {
    pub avatar_data: Pubkey,
    pub stellar_program: Pubkey,
    pub release: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
}

impl StellarAvatarLink {
    pub const INIT_SPACE: usize = 32 + 32 + 32 + 32 + 1;
}

impl AvatarRegistry {
    pub const INIT_SPACE: usize = 8 + 1;
}

fn metadata_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"metadata", mpl_token_metadata::ID.as_ref(), mint.as_ref()],
        &mpl_token_metadata::ID,
    )
    .0
}

fn uri_matches_avatar_hash(uri: &str, hash: &str) -> bool {
    uri == hash || uri == format!("ipfs://{hash}") || uri.ends_with(&format!("/{hash}"))
}

fn anchor_discriminator(ix_name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("global:{ix_name}").as_bytes());
    let hash = hasher.finalize();
    let mut discriminator = [0_u8; 8];
    discriminator.copy_from_slice(&hash[..8]);
    discriminator
}

fn validate_stellar_release<'info>(
    stellar_program: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
) -> Result<()> {
    require_keys_eq!(
        *stellar_program.key,
        SOLANA_STELLAR_PROGRAM_ID,
        CustomError::InvalidStellarProgram
    );
    require!(
        stellar_program.executable,
        CustomError::InvalidStellarProgram
    );
    require_keys_eq!(
        *release.owner,
        *stellar_program.key,
        CustomError::InvalidStellarRelease
    );

    let release_data = release.try_borrow_data()?;
    require!(
        release_data.len() > RELEASE_STATUS_OFFSET,
        CustomError::InvalidStellarRelease
    );

    let mut vault_bytes = [0_u8; 32];
    vault_bytes.copy_from_slice(&release_data[RELEASE_VAULT_OFFSET..RELEASE_VAULT_OFFSET + 32]);
    let stored_vault = Pubkey::new_from_array(vault_bytes);
    require_keys_eq!(stored_vault, *vault.key, CustomError::InvalidStellarVault);

    let status = release_data[RELEASE_STATUS_OFFSET];
    require!(
        status == RELEASE_STATUS_FINALIZED || status == RELEASE_STATUS_LINKED,
        CustomError::InvalidStellarRelease
    );

    Ok(())
}

fn deposit_revenue_to_stellar<'info>(
    amount: u64,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    stellar_program: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
) -> Result<()> {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&anchor_discriminator("deposit_revenue"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: *stellar_program.key,
        accounts: vec![
            AccountMeta::new(*release.key, false),
            AccountMeta::new(*vault.key, false),
            AccountMeta::new(*payer.key, true),
            AccountMeta::new_readonly(*system_program.key, false),
        ],
        data,
    };

    invoke(
        &ix,
        &[
            release.clone(),
            vault.clone(),
            payer.clone(),
            system_program.clone(),
            stellar_program.clone(),
        ],
    )?;

    Ok(())
}

#[program]
pub mod avatar_nft_minter {
    use super::*;

    pub fn initialize_avatar(
        ctx: Context<InitializeAvatar>,
        uri_ipfs_hash: String,
        max_supply: u64, // New: maximum number of mints (u64::MAX for unlimited)
        minting_fee_per_mint: u64, // Renamed for clarity
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.bump = ctx.bumps.registry;

        // grab current index
        let index = registry.next_index;
        // bump counter for next call
        registry.next_index = registry
            .next_index
            .checked_add(1)
            .ok_or(CustomError::NumericalOverflow)?;

        require!(
            uri_ipfs_hash.len() > 0 && uri_ipfs_hash.len() <= AvatarData::MAX_IPFS_HASH_LEN,
            CustomError::InvalidIpfsHashLength
        );

        // It's good practice to ensure max_supply isn't ridiculously small if fees are involved,
        // or handle max_supply = 0 explicitly if it means something special (e.g. unmintable)
        // For now, max_supply = 0 will mean it's unmintable due to the mint_nft check.

        let avatar_data = &mut ctx.accounts.avatar_data;
        avatar_data.uri_ipfs_hash = uri_ipfs_hash.clone();
        avatar_data.creator = *ctx.accounts.payer.key;
        avatar_data.max_supply = max_supply;
        avatar_data.current_supply = 0;
        avatar_data.minting_fee_per_mint = minting_fee_per_mint;
        avatar_data.total_unclaimed_fees = 0;
        avatar_data.bump = ctx.bumps.avatar_data;
        avatar_data.index = index;
        ctx.accounts.escrow.bump = ctx.bumps.escrow;

        msg!(
            "Avatar PDA initialized for IPFS hash: {}, Max Supply: {}, Fee per Mint: {}",
            avatar_data.uri_ipfs_hash,
            avatar_data.max_supply,
            avatar_data.minting_fee_per_mint
        );
        Ok(())
    }

    pub fn initialize_avatar_from_stellar(
        ctx: Context<InitializeAvatarFromStellar>,
        uri_ipfs_hash: String,
        max_supply: u64,
        minting_fee_per_mint: u64,
    ) -> Result<()> {
        validate_stellar_release(
            &ctx.accounts.stellar_program,
            &ctx.accounts.stellar_release,
            &ctx.accounts.stellar_vault,
        )?;

        let registry = &mut ctx.accounts.registry;
        registry.bump = ctx.bumps.registry;

        let index = registry.next_index;
        registry.next_index = registry
            .next_index
            .checked_add(1)
            .ok_or(CustomError::NumericalOverflow)?;

        require!(
            uri_ipfs_hash.len() > 0 && uri_ipfs_hash.len() <= AvatarData::MAX_IPFS_HASH_LEN,
            CustomError::InvalidIpfsHashLength
        );

        let avatar_data = &mut ctx.accounts.avatar_data;
        avatar_data.uri_ipfs_hash = uri_ipfs_hash.clone();
        avatar_data.creator = Pubkey::default();
        avatar_data.max_supply = max_supply;
        avatar_data.current_supply = 0;
        avatar_data.minting_fee_per_mint = minting_fee_per_mint;
        avatar_data.total_unclaimed_fees = 0;
        avatar_data.bump = ctx.bumps.avatar_data;
        avatar_data.index = index;

        ctx.accounts.escrow.bump = ctx.bumps.escrow;

        let stellar_link = &mut ctx.accounts.stellar_link;
        stellar_link.avatar_data = avatar_data.key();
        stellar_link.stellar_program = ctx.accounts.stellar_program.key();
        stellar_link.release = ctx.accounts.stellar_release.key();
        stellar_link.vault = ctx.accounts.stellar_vault.key();
        stellar_link.bump = ctx.bumps.stellar_link;

        msg!(
            "Stellar-linked Avatar PDA initialized for IPFS hash: {}, release: {}",
            avatar_data.uri_ipfs_hash,
            stellar_link.release
        );
        Ok(())
    }

    pub fn mint_nft<'info>(
        ctx: Context<'_, '_, 'info, 'info, MintNft<'info>>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let avatar_data = &mut ctx.accounts.avatar_data;
        let payer = &ctx.accounts.payer; // This is the minter

        require!(
            uri_matches_avatar_hash(&uri, &avatar_data.uri_ipfs_hash),
            CustomError::InvalidMetadataUri
        );

        let expected_metadata = metadata_pda(&ctx.accounts.mint.key());
        require_keys_eq!(
            ctx.accounts.metadata_account.key(),
            expected_metadata,
            CustomError::InvalidMetadataAccount
        );

        require!(
            avatar_data.current_supply < avatar_data.max_supply,
            CustomError::MaxSupplyReached
        );

        // 0. Route minting_fee_per_mint either to legacy escrow or Stellar release vault.
        if avatar_data.minting_fee_per_mint > 0 {
            let fee_to_pay = avatar_data.minting_fee_per_mint;

            if avatar_data.creator == Pubkey::default() {
                require!(
                    ctx.remaining_accounts.len() == 4,
                    CustomError::MissingStellarLink
                );

                let stellar_link_info = &ctx.remaining_accounts[0];
                let stellar_program = &ctx.remaining_accounts[1];
                let stellar_release = &ctx.remaining_accounts[2];
                let stellar_vault = &ctx.remaining_accounts[3];
                let stellar_link = Account::<StellarAvatarLink>::try_from(stellar_link_info)?;
                let (expected_stellar_link, _) = Pubkey::find_program_address(
                    &[STELLAR_LINK_SEED, avatar_data.key().as_ref()],
                    ctx.program_id,
                );

                require_keys_eq!(
                    stellar_link_info.key(),
                    expected_stellar_link,
                    CustomError::InvalidStellarLink
                );
                require_keys_eq!(
                    stellar_link.avatar_data,
                    avatar_data.key(),
                    CustomError::InvalidStellarLink
                );
                require_keys_eq!(
                    stellar_link.stellar_program,
                    *stellar_program.key,
                    CustomError::InvalidStellarProgram
                );
                require_keys_eq!(
                    stellar_link.release,
                    *stellar_release.key,
                    CustomError::InvalidStellarRelease
                );
                require_keys_eq!(
                    stellar_link.vault,
                    *stellar_vault.key,
                    CustomError::InvalidStellarVault
                );
                validate_stellar_release(stellar_program, stellar_release, stellar_vault)?;

                deposit_revenue_to_stellar(
                    fee_to_pay,
                    &payer.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    stellar_program,
                    stellar_release,
                    stellar_vault,
                )?;

                msg!(
                    "Deposited {} lamports mint fee into Stellar release vault {}",
                    fee_to_pay,
                    stellar_vault.key()
                );
            } else {
                let escrow_key = ctx.accounts.escrow.key();

                let ix = system_instruction::transfer(payer.key, &escrow_key, fee_to_pay);

                invoke(
                    &ix,
                    &[
                        payer.to_account_info(),
                        ctx.accounts.escrow.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                )?;

                avatar_data.total_unclaimed_fees = avatar_data
                    .total_unclaimed_fees
                    .checked_add(fee_to_pay)
                    .ok_or(CustomError::NumericalOverflow)?;

                msg!(
                    "Transferred {} lamports fee to escrow PDA {}",
                    fee_to_pay,
                    escrow_key
                );
            }
        }

        // 1. Mint the token
        let cpi_accounts_mint_to = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: payer.to_account_info(),
        };
        let cpi_program_token = ctx.accounts.token_program.to_account_info();
        let cpi_ctx_mint_to = CpiContext::new(cpi_program_token, cpi_accounts_mint_to);
        mint_to(cpi_ctx_mint_to, 1)?;

        msg!("NFT token minted to: {}", ctx.accounts.token_account.key());

        // 2. Create metadata account
        let cpi_context_metadata = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: payer.to_account_info(),
                payer: payer.to_account_info(),
                update_authority: payer.to_account_info(), // Minter is UA, can be changed later
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        );

        let creators = if avatar_data.creator == Pubkey::default() {
            // Handle case where creator might be null/default
            None
        } else {
            Some(vec![Creator {
                address: avatar_data.creator,
                verified: false, // Original creator is not signing this tx
                share: 100,
            }])
        };

        let data_v2 = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators,
            collection: None,
            uses: None,
        };

        create_metadata_accounts_v3(cpi_context_metadata, data_v2, false, true, None)?;

        // Revoke mint/freeze authority to enforce non-inflationary, non-freezable NFTs.
        let cpi_program_token = ctx.accounts.token_program.to_account_info();
        let revoke_mint_ctx = CpiContext::new(
            cpi_program_token.clone(),
            SetAuthority {
                account_or_mint: ctx.accounts.mint.to_account_info(),
                current_authority: payer.to_account_info(),
            },
        );
        set_authority(revoke_mint_ctx, AuthorityType::MintTokens, None)?;

        let revoke_freeze_ctx = CpiContext::new(
            cpi_program_token,
            SetAuthority {
                account_or_mint: ctx.accounts.mint.to_account_info(),
                current_authority: payer.to_account_info(),
            },
        );
        set_authority(revoke_freeze_ctx, AuthorityType::FreezeAccount, None)?;

        avatar_data.current_supply = avatar_data
            .current_supply
            .checked_add(1)
            .ok_or(CustomError::NumericalOverflow)?;

        msg!(
            "NFT metadata created for mint: {}. Current supply for PDA: {}/{}",
            ctx.accounts.mint.to_account_info().key(),
            avatar_data.current_supply,
            avatar_data.max_supply
        );
        Ok(())
    }

    pub fn claim_fee(ctx: Context<ClaimFee>) -> Result<()> {
        let avatar_data = &mut ctx.accounts.avatar_data;
        let creator_info = ctx.accounts.creator.to_account_info();
        let escrow_info = ctx.accounts.escrow.to_account_info();

        let fees_to_claim = avatar_data.total_unclaimed_fees;
        require!(fees_to_claim > 0, CustomError::NoFeesToClaim);
        require!(
            escrow_info.lamports() >= fees_to_claim,
            CustomError::InsufficientEscrowBalance
        );

        let creator_new_balance = creator_info
            .lamports()
            .checked_add(fees_to_claim)
            .ok_or(CustomError::NumericalOverflow)?;
        let escrow_new_balance = escrow_info
            .lamports()
            .checked_sub(fees_to_claim)
            .ok_or(CustomError::InsufficientEscrowBalance)?;

        **creator_info.try_borrow_mut_lamports()? = creator_new_balance;
        **escrow_info.try_borrow_mut_lamports()? = escrow_new_balance;

        avatar_data.total_unclaimed_fees = 0;

        msg!(
            "Fees of {} lamports claimed by creator {} from escrow {}",
            fees_to_claim,
            creator_info.key(),
            escrow_info.key()
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(uri_ipfs_hash: String, max_supply: u64, minting_fee_per_mint: u64)]
pub struct InitializeAvatar<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + AvatarRegistry::INIT_SPACE,
        seeds = [b"avatar_registry"],
        bump
    )]
    pub registry: Account<'info, AvatarRegistry>,

    #[account(
        init,
        payer = payer,
        space = 8 + AvatarData::INIT_SPACE,
        seeds = [
            AVATAR_SEED.as_ref(),
            &registry.next_index.to_le_bytes()
        ],
        bump
    )]
    pub avatar_data: Account<'info, AvatarData>,

    #[account(mut)]
    pub payer: Signer<'info>, // This is the creator

    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, &registry.next_index.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(uri_ipfs_hash: String, max_supply: u64, minting_fee_per_mint: u64)]
pub struct InitializeAvatarFromStellar<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + AvatarRegistry::INIT_SPACE,
        seeds = [b"avatar_registry"],
        bump
    )]
    pub registry: Account<'info, AvatarRegistry>,

    #[account(
        init,
        payer = payer,
        space = 8 + AvatarData::INIT_SPACE,
        seeds = [
            AVATAR_SEED.as_ref(),
            &registry.next_index.to_le_bytes()
        ],
        bump
    )]
    pub avatar_data: Account<'info, AvatarData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, &registry.next_index.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = payer,
        space = 8 + StellarAvatarLink::INIT_SPACE,
        seeds = [STELLAR_LINK_SEED, avatar_data.key().as_ref()],
        bump
    )]
    pub stellar_link: Account<'info, StellarAvatarLink>,

    /// CHECK: Validated by owner, executable bit, and hard-coded program id.
    pub stellar_program: AccountInfo<'info>,
    /// CHECK: Validated as a solana-stellar Release account by fixed-layout fields.
    pub stellar_release: AccountInfo<'info>,
    /// CHECK: Validated against the vault stored in the Stellar release account.
    pub stellar_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(
        mut,
        seeds = [
            AVATAR_SEED.as_ref(),
            &avatar_data.index.to_le_bytes()
        ],
        bump = avatar_data.bump,
    )]
    pub avatar_data: Account<'info, AvatarData>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
        mint::freeze_authority = payer,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub token_account: Account<'info, TokenAccount>,

    #[account(mut)] // Should be mut for metadata creation
    ///CHECK: We are passing this in for the CPI call, but not deserializing it
    pub metadata_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>, // This is the minter

    #[account(
        mut,
        seeds = [
            ESCROW_SEED,
            &avatar_data.index.to_le_bytes()
        ],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimFee<'info> {
    #[account(
        mut,
        seeds = [
            AVATAR_SEED.as_ref(),
            &avatar_data.index.to_le_bytes()
        ],
        bump = avatar_data.bump,
        has_one = creator @ CustomError::Unauthorized,
    )]
    pub avatar_data: Account<'info, AvatarData>,

    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [
            ESCROW_SEED,
            &avatar_data.index.to_le_bytes()
        ],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct AvatarData {
    pub uri_ipfs_hash: String,
    pub creator: Pubkey,
    pub max_supply: u64, // u64::MAX for unlimited
    pub current_supply: u64,
    pub minting_fee_per_mint: u64, // Fee for each mint
    pub total_unclaimed_fees: u64, // Accumulated fees in PDA from successful mints
    pub index: u64,
    pub bump: u8,
}

impl AvatarData {
    pub const MAX_IPFS_HASH_LEN: usize = 64;
    // String prefix (4) + max ipfs hash + scalar fields.
    pub const INIT_SPACE: usize = 4 + Self::MAX_IPFS_HASH_LEN + 32 + 8 + 8 + 8 + 8 + 8 + 1;
}

#[error_code]
pub enum CustomError {
    #[msg("Invalid IPFS hash length.")]
    InvalidIpfsHashLength,
    #[msg("Maximum supply for this avatar has been reached.")]
    MaxSupplyReached, // Renamed
    #[msg("Unauthorized action.")]
    Unauthorized,
    #[msg("No fees have been accumulated to claim.")]
    NoFeesToClaim, // Renamed and re-purposed
    // #[msg("No fee to claim, or fee has already been claimed.")] // Old one, replaced
    // NftNotMintedToClaimFee, // Old one, replaced
    #[msg("Numerical overflow occurred.")]
    NumericalOverflow,
    #[msg("Escrow balance insufficient to cover fees and rent.")]
    InsufficientEscrowBalance,
    #[msg("Metadata account is not the canonical PDA for this mint.")]
    InvalidMetadataAccount,
    #[msg("Metadata URI must match the avatar hash policy.")]
    InvalidMetadataUri,
    #[msg("Invalid Stellar program.")]
    InvalidStellarProgram,
    #[msg("Invalid Stellar release account.")]
    InvalidStellarRelease,
    #[msg("Invalid Stellar vault account.")]
    InvalidStellarVault,
    #[msg("Missing Stellar link accounts.")]
    MissingStellarLink,
    #[msg("Invalid Stellar avatar link account.")]
    InvalidStellarLink,
}
