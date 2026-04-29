use anchor_lang::prelude::*;

#[constant]
pub const AVATAR_SEED: &[u8] = b"avatar_v1";

#[constant]
pub const ESCROW_SEED: &[u8] = b"avatar_escrow";

#[constant]
pub const STELLAR_LINK_SEED: &[u8] = b"stellar_avatar_link";

pub const SOLANA_STELLAR_PROGRAM_ID: Pubkey =
    pubkey!("3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA");
pub const RELEASE_VAULT_OFFSET: usize = 8 + 32 + 32;
pub const RELEASE_STATUS_OFFSET: usize = 8 + 32 + 32 + 32 + 8 + 32;
pub const RELEASE_STATUS_FINALIZED: u8 = 1;
pub const RELEASE_STATUS_LINKED: u8 = 2;
