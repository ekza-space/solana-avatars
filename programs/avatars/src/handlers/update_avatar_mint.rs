use anchor_lang::prelude::*;

use crate::{contexts::UpdateAvatarMint, error::CustomError, utils::validate_avatar_ownership};

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
