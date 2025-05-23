#![allow(unexpected_cfgs)] // TODO: wtf?!
use anchor_lang::{
    prelude::*,
    solana_program::system_instruction,
};

use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::types::{Creator, DataV2},
        CreateMetadataAccountsV3, Metadata,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};

declare_id!("29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz");

#[constant]
const AVATAR_SEED: &[u8] = b"avatar_v1";

#[constant]
const ESCROW_SEED: &[u8] = b"avatar_escrow";


#[account]
pub struct Escrow {
    pub bump: u8,
}

#[account]
pub struct AvatarRegistry {
    pub next_index: u64,
    pub bump: u8,
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
        // grab current index
        let index = registry.next_index;
        // bump counter for next call
        registry.next_index = registry
            .next_index
            .checked_add(1)
            .ok_or(CustomError::NumericalOverflow)?;

        require!(
            uri_ipfs_hash.len() > 0 && uri_ipfs_hash.len() <= 64,
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

        msg!(
            "Avatar PDA initialized for IPFS hash: {}, Max Supply: {}, Fee per Mint: {}",
            avatar_data.uri_ipfs_hash,
            avatar_data.max_supply,
            avatar_data.minting_fee_per_mint
        );
        Ok(())
    }

    pub fn mint_nft(
        ctx: Context<MintNft>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let avatar_data = &mut ctx.accounts.avatar_data;
        let payer = &ctx.accounts.payer; // This is the minter

        require!(
            avatar_data.current_supply < avatar_data.max_supply,
            CustomError::MaxSupplyReached
        );

        // 0. Transfer minting_fee_per_mint from minter (payer) to ESCROW PDA
        if avatar_data.minting_fee_per_mint > 0 {
            let fee_to_pay = avatar_data.minting_fee_per_mint;
            let escrow_key = ctx.accounts.escrow.key();

            let ix = system_instruction::transfer(
                payer.key,
                &escrow_key,
                fee_to_pay,
            );

            anchor_lang::solana_program::program::invoke(
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
        let escrow_info  = ctx.accounts.escrow.to_account_info();

        let fees_to_claim = avatar_data.total_unclaimed_fees;
        require!(fees_to_claim > 0, CustomError::NoFeesToClaim);
        require!(
            escrow_info.lamports() >= fees_to_claim,
            CustomError::InsufficientEscrowBalance
        );

        **creator_info.try_borrow_mut_lamports()? += fees_to_claim;
        **escrow_info.try_borrow_mut_lamports()?  -= fees_to_claim;

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
        space = 8 + 8 + 1, // discriminator + next_index (u64) + bump
        seeds = [b"avatar_registry"],
        bump
    )]
    pub registry: Account<'info, AvatarRegistry>,

    #[account(
        init,
        payer = payer,
        // Space: 8(disc) + (4+64 ipfs) + 32(creator) + 8(max_supply) + 8(current_supply) + 8(fee_per_mint) + 8(unclaimed_fees) + 8(index) + 1(bump)
        space = 8 + 68 + 32 + 8 + 8 + 8 + 8 + 8 + 1, // = 149 bytes
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
        space = 8 + 1,
        seeds = [ESCROW_SEED, &registry.next_index.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

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
        bump
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
        bump
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
// Expected space: 8 + 68 + 32 + 8 + 8 + 8 + 8 + 8 + 1 = 149 bytes

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
    // Optional, if explicit check is added
    InsufficientEscrowBalance,
}
