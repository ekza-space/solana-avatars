use anchor_lang::prelude::*;

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
