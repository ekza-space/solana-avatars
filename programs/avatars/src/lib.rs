#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

declare_id!("56kfTdE1xmCkZ2eDuikD7S5Mr15nmdzQENDWfmdMVtt");

#[program]
pub mod user_profile {
    use super::*;

    /// Creates the signer’s profile PDA. Fails if it already exists.
    pub fn initialize_profile(
        ctx: Context<InitializeProfile>,
        username: [u8; 32],
        description: [u8; 128],
        avatar_mint: Pubkey,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.avatar_mint.key(),
            avatar_mint,
            CustomError::AvatarMintMismatch
        );
        validate_avatar_ownership(
            ctx.accounts.owner.key,
            &ctx.accounts.avatar_mint.key(),
            &ctx.accounts.owner_avatar_token_account,
        )?;

        let profile = &mut ctx.accounts.profile;

        profile.owner = *ctx.accounts.owner.key;
        profile.username = username;
        profile.description = description;
        profile.avatar_mint = ctx.accounts.avatar_mint.key();
        profile.created_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Partial update of profile fields.
    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        username: Option<[u8; 32]>,
        description: Option<[u8; 128]>,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        if let Some(v) = username {
            profile.username = v;
        }
        if let Some(v) = description {
            profile.description = v;
        }

        Ok(())
    }

    /// Updates linked avatar mint after proving token ownership.
    pub fn update_avatar_mint(ctx: Context<UpdateAvatarMint>, avatar_mint: Pubkey) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.avatar_mint.key(),
            avatar_mint,
            CustomError::AvatarMintMismatch
        );
        validate_avatar_ownership(
            ctx.accounts.owner.key,
            &ctx.accounts.avatar_mint.key(),
            &ctx.accounts.owner_avatar_token_account,
        )?;
        ctx.accounts.profile.avatar_mint = avatar_mint;
        Ok(())
    }

    /// Closes the profile PDA and returns lamports to the owner.
    pub fn delete_profile(_ctx: Context<DeleteProfile>) -> Result<()> {
        Ok(())
    }
}

/// One‑per‑user profile PDA: seeds = ["profile", owner].
#[account]
pub struct UserProfile {
    pub owner: Pubkey,
    pub username: [u8; 32],
    pub description: [u8; 128],
    pub avatar_mint: Pubkey,
    pub created_at: i64,
}

impl UserProfile {
    pub const INIT_SPACE: usize = 32 + // owner
        32 + // username
        128 + // description
        32 + // avatar_mint
        8; // created_at
}

fn validate_avatar_ownership(
    owner: &Pubkey,
    avatar_mint: &Pubkey,
    owner_avatar_token_account: &Account<TokenAccount>,
) -> Result<()> {
    require_keys_eq!(
        owner_avatar_token_account.owner,
        *owner,
        CustomError::AvatarTokenOwnerMismatch
    );
    require_keys_eq!(
        owner_avatar_token_account.mint,
        *avatar_mint,
        CustomError::AvatarTokenMintMismatch
    );
    require!(
        owner_avatar_token_account.amount > 0,
        CustomError::AvatarTokenBalanceZero
    );
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProfile<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [b"profile", owner.key().as_ref()],
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
        seeds = [b"profile", owner.key().as_ref()],
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
        seeds = [b"profile", owner.key().as_ref()],
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
        seeds = [b"profile", owner.key().as_ref()],
        bump,
        has_one = owner,
    )]
    pub profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[error_code]
pub enum CustomError {
    #[msg("Passed avatar mint does not match avatar mint account.")]
    AvatarMintMismatch,
    #[msg("Avatar token account owner mismatch.")]
    AvatarTokenOwnerMismatch,
    #[msg("Avatar token account mint mismatch.")]
    AvatarTokenMintMismatch,
    #[msg("Avatar token account balance must be greater than zero.")]
    AvatarTokenBalanceZero,
}
