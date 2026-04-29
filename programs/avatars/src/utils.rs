use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::error::CustomError;

pub fn validate_avatar_ownership(
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
