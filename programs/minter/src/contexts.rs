use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::Metadata,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::{AVATAR_SEED, ESCROW_SEED, STELLAR_LINK_SEED},
    error::CustomError,
    state::{AvatarData, AvatarRegistry, Escrow, StellarAvatarLink},
};

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
    pub payer: Signer<'info>,

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

    #[account(mut)]
    /// CHECK: Validated against the canonical Metaplex metadata PDA.
    pub metadata_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

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
