#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

declare_id!("56kfTdE1xmCkZ2eDuikD7S5Mr15nmdzQENDWfmdMVtt");
#[program]
pub mod user_avatar {
    use super::*;
    /// Initialize the avatar counter. Called once by the program deployer.
    pub fn initialize(ctx: Context<InitializeCounter>) -> Result<()> {
        ctx.accounts.counter.next_id = 1;
        Ok(())
    }
    /// Create a new user avatar.
    pub fn create_user_avatar(
        ctx: Context<CreateUserAvatar>,
        username: [u8; 32],
        description: [u8; 128],
        avatar_2d_hash: [u8; 32],
        avatar_3d_hash: [u8; 32],
    ) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        let avatar = &mut ctx.accounts.avatar;

        avatar.id = counter.next_id;
        avatar.owner = *ctx.accounts.owner.key;
        avatar.username = username;
        avatar.description = description;
        avatar.avatar_2d_hash = avatar_2d_hash;
        avatar.avatar_3d_hash = avatar_3d_hash;
        avatar.created_at = Clock::get()?.unix_timestamp;
        counter.next_id = counter
            .next_id
            .checked_add(1)
            .ok_or(ErrorCode::IdOverflow)?;
        Ok(())
    }
    /// Update an existing user avatar (partial updates allowed).
    pub fn update_user_avatar(
        ctx: Context<UpdateUserAvatar>,
        username: Option<[u8; 32]>,
        description: Option<[u8; 128]>,
        avatar_2d_hash: Option<[u8; 32]>,
        avatar_3d_hash: Option<[u8; 32]>,
    ) -> Result<()> {
        let avatar = &mut ctx.accounts.avatar;

        if let Some(v) = username {
            avatar.username = v;
        }
        if let Some(v) = description {
            avatar.description = v;
        }
        if let Some(v) = avatar_2d_hash {
            avatar.avatar_2d_hash = v;
        }
        if let Some(v) = avatar_3d_hash {
            avatar.avatar_3d_hash = v;
        }

        Ok(())
    }
    /// Delete a user avatar and close the account, returning lamports to the owner.
    pub fn delete_user_avatar(_ctx: Context<DeleteUserAvatar>) -> Result<()> {
        Ok(())
    }
}

#[account]
/// AvatarCounter PDA account: seeds = ["avatar_counter"].
pub struct AvatarCounter {
    pub next_id: u64,
}

#[account]
/// UserAvatar PDA account: seeds = ["user_id", id.to_le_bytes()].
pub struct UserAvatar {
    pub id: u64,
    pub owner: Pubkey,
    pub username: [u8; 32],
    pub description: [u8; 128],
    pub avatar_2d_hash: [u8; 32],
    pub avatar_3d_hash: [u8; 32],
    pub created_at: i64,
}

impl UserAvatar {
    pub const SIZE: usize = 8 +   // discriminator
        8 +   // id: u64
        32 +  // owner: Pubkey
        32 +  // username: [u8; 32]
        128 + // description: [u8; 128]
        32 +  // avatar_2d_hash: [u8; 32]
        32 +  // avatar_3d_hash: [u8; 32]
        8; // created_at: i64
}

#[derive(Accounts)]
pub struct InitializeCounter<'info> {
    #[account(
        init,
        payer = payer,
        seeds = [b"avatar_counter"],
        bump,
        space = 8 + 8
    )]
    pub counter: Account<'info, AvatarCounter>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateUserAvatar<'info> {
    #[account(
        mut,
        seeds = [b"avatar_counter"],
        bump,
    )]
    pub counter: Account<'info, AvatarCounter>,
    #[account(
        init,
        payer  = owner,
        seeds  = [b"user_id".as_ref(), &counter.next_id.to_le_bytes()[..]],
        bump,
        space  = 8 + UserAvatar::SIZE,
    )]
    pub avatar: Account<'info, UserAvatar>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateUserAvatar<'info> {
    #[account(
        mut,
        seeds = [b"user_id".as_ref(), &avatar.id.to_le_bytes()[..]],
        bump,
        has_one = owner,
    )]
    pub avatar: Account<'info, UserAvatar>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeleteUserAvatar<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [b"user_id".as_ref(), &avatar.id.to_le_bytes()[..]],
        bump,
        has_one = owner,
    )]
    pub avatar: Account<'info, UserAvatar>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Counter overflow")]
    IdOverflow,
}
