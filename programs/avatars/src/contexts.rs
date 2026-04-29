use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::{constants::PROFILE_SEED, state::UserProfile};

#[derive(Accounts)]
pub struct InitializeProfile<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump,
        space = 8 + UserProfile::INIT_SPACE,
    )]
    pub profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub avatar_mint: Account<'info, Mint>,
    pub owner_avatar_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        mut,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump,
        has_one = owner,
    )]
    pub profile: Account<'info, UserProfile>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAvatarMint<'info> {
    #[account(
        mut,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump,
        has_one = owner,
    )]
    pub profile: Account<'info, UserProfile>,
    pub owner: Signer<'info>,
    pub avatar_mint: Account<'info, Mint>,
    pub owner_avatar_token_account: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct DeleteProfile<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump,
        has_one = owner,
    )]
    pub profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub owner: Signer<'info>,
}
