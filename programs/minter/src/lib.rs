use anchor_lang::{prelude::*, solana_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::types::{Creator, DataV2},
        CreateMetadataAccountsV3,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};
use solana_program::pubkey::Pubkey;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod avatar_nft_minter {
    use super::*;

    pub fn initialize_avatar(ctx: Context<InitializeAvatar>, ipfs_hash: String) -> Result<()> {
        require!(
            ipfs_hash.len() > 0 && ipfs_hash.len() <= 64,
            CustomError::InvalidIpfsHashLength
        );

        let avatar_data = &mut ctx.accounts.avatar_data;
        avatar_data.ipfs_hash = ipfs_hash;
        avatar_data.creator = *ctx.accounts.payer.key;
        avatar_data.is_minted = false;

        msg!(
            "Avatar PDA initialized for IPFS hash: {}",
            avatar_data.ipfs_hash
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
        require!(!avatar_data.is_minted, CustomError::NftAlreadyMinted);
        // This require handles the authorization, so has_one = creator was redundant/misconfigured
        require!(
            avatar_data.creator == *ctx.accounts.payer.key,
            CustomError::Unauthorized
        );

        // 1. Mint the token
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        mint_to(cpi_ctx, 1)?;

        msg!("NFT token minted to: {}", ctx.accounts.token_account.key());

        // 2. Create metadata account
        let cpi_context_metadata = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.payer.to_account_info(),
                payer: ctx.accounts.payer.to_account_info(),
                update_authority: ctx.accounts.payer.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        );

        let data_v2 = DataV2 {
            name: name,
            symbol: symbol,
            uri: uri,
            seller_fee_basis_points: 0,
            creators: Some(vec![
                // Use the imported Creator struct
                Creator {
                    address: ctx.accounts.payer.key(),
                    verified: true, // Payer is also update authority, so can verify self on creation
                    share: 100,
                },
            ]),
            collection: None,
            uses: None,
        };

        // Add None for the CollectionDetails argument
        create_metadata_accounts_v3(cpi_context_metadata, data_v2, false, true, None)?;

        avatar_data.is_minted = true;
        avatar_data.mint_key = Some(*ctx.accounts.mint.to_account_info().key);

        msg!(
            "NFT metadata created for mint: {}",
            ctx.accounts.mint.to_account_info().key()
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(ipfs_hash: String)]
pub struct InitializeAvatar<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 64 + 32 + 1 + 33,
        seeds = [b"avatar_v1".as_ref(), ipfs_hash.as_bytes()],
        bump
    )]
    pub avatar_data: Account<'info, AvatarData>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(
        mut,
        seeds = [b"avatar_v1".as_ref(), avatar_data.ipfs_hash.as_bytes()],
        bump,
        // Removed: has_one = creator (rely on the require! in the instruction logic)
    )]
    pub avatar_data: Account<'info, AvatarData>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
        mint::freeze_authority = payer,
    )]
    pub mint: Account<'info, Mint>, // Uses the corrected Mint import

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub token_account: Account<'info, TokenAccount>,

    ///CHECK: We are passing this in for the CPI call, but not deserializing it
    #[account(mut)]
    pub metadata_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, anchor_spl::metadata::Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct AvatarData {
    pub ipfs_hash: String,
    pub creator: Pubkey,
    pub is_minted: bool,
    pub mint_key: Option<Pubkey>,
}

#[error_code]
pub enum CustomError {
    #[msg("Invalid IPFS hash length.")]
    InvalidIpfsHashLength,
    #[msg("NFT for this avatar has already been minted.")]
    NftAlreadyMinted,
    #[msg("Unauthorized action. Only the PDA creator can mint.")]
    Unauthorized,
}
