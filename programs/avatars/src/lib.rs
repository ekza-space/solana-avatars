#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

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
        let profile = &mut ctx.accounts.profile;

        profile.owner = *ctx.accounts.owner.key;
        profile.username = username;
        profile.description = description;
        profile.avatar_mint = avatar_mint;
        profile.created_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Partial update of profile fields.
    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        username: Option<[u8; 32]>,
        description: Option<[u8; 128]>,
        avatar_mint: Option<Pubkey>,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        if let Some(v) = username {
            profile.username = v;
        }
        if let Some(v) = description {
            profile.description = v;
        }
        if let Some(pk) = avatar_mint {
            profile.avatar_mint = pk;
        }

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
    pub const SIZE: usize = 8 +  // discriminator
        32 + // owner
        32 + // username
        128 + // description
        32 + // avatar_mint
        8;   // created_at
}

#[derive(Accounts)]
pub struct InitializeProfile<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [b"profile", owner.key().as_ref()],
        bump,
        space = 8 + UserProfile::SIZE,
    )]
    pub profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub owner: Signer<'info>,
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
    #[account(mut)]
    pub owner: Signer<'info>,
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
