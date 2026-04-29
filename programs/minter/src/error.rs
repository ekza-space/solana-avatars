use anchor_lang::prelude::*;

#[error_code]
pub enum CustomError {
    #[msg("Invalid IPFS hash length.")]
    InvalidIpfsHashLength,
    #[msg("Maximum supply for this avatar has been reached.")]
    MaxSupplyReached,
    #[msg("Unauthorized action.")]
    Unauthorized,
    #[msg("No fees have been accumulated to claim.")]
    NoFeesToClaim,
    #[msg("Numerical overflow occurred.")]
    NumericalOverflow,
    #[msg("Escrow balance insufficient to cover fees and rent.")]
    InsufficientEscrowBalance,
    #[msg("Metadata account is not the canonical PDA for this mint.")]
    InvalidMetadataAccount,
    #[msg("Metadata URI must match the avatar hash policy.")]
    InvalidMetadataUri,
    #[msg("Invalid Stellar program.")]
    InvalidStellarProgram,
    #[msg("Invalid Stellar release account.")]
    InvalidStellarRelease,
    #[msg("Invalid Stellar vault account.")]
    InvalidStellarVault,
    #[msg("Missing Stellar link accounts.")]
    MissingStellarLink,
    #[msg("Invalid Stellar avatar link account.")]
    InvalidStellarLink,
}
