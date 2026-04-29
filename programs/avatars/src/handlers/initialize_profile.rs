use anchor_lang::prelude::*;

use crate::{contexts::InitializeProfile, error::CustomError, utils::validate_avatar_ownership};

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
