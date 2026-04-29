#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod constants;
pub mod contexts;
pub mod error;
pub mod handlers;
pub mod state;
pub mod utils;

pub use contexts::*;
pub use error::*;
pub use state::*;

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
        handlers::initialize_profile(ctx, username, description, avatar_mint)
    }

    /// Partial update of profile fields.
    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        username: Option<[u8; 32]>,
        description: Option<[u8; 128]>,
    ) -> Result<()> {
        handlers::update_profile(ctx, username, description)
    }

    /// Updates linked avatar mint after proving token ownership.
    pub fn update_avatar_mint(ctx: Context<UpdateAvatarMint>, avatar_mint: Pubkey) -> Result<()> {
        handlers::update_avatar_mint(ctx, avatar_mint)
    }

    /// Closes the profile PDA and returns lamports to the owner.
    pub fn delete_profile(ctx: Context<DeleteProfile>) -> Result<()> {
        handlers::delete_profile(ctx)
    }
}
