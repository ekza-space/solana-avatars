use anchor_lang::prelude::*;

#[account]
pub struct Escrow {
    pub bump: u8,
}

impl Escrow {
    pub const INIT_SPACE: usize = 1;
}

#[account]
pub struct AvatarRegistry {
    pub next_index: u64,
    pub bump: u8,
}

impl AvatarRegistry {
    pub const INIT_SPACE: usize = 8 + 1;
}

#[account]
pub struct StellarAvatarLink {
    pub avatar_data: Pubkey,
    pub stellar_program: Pubkey,
    pub universe: Pubkey,
    pub asset: Pubkey,
    pub release: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
}

impl StellarAvatarLink {
    pub const INIT_SPACE: usize = 32 + 32 + 32 + 32 + 32 + 32 + 1;
}

#[account]
pub struct StellarReleaseLink {
    pub release: Pubkey,
    pub stellar_program: Pubkey,
    pub universe: Pubkey,
    pub asset: Pubkey,
    pub vault: Pubkey,
    pub avatar_data: Pubkey,
    pub bump: u8,
}

impl StellarReleaseLink {
    pub const INIT_SPACE: usize = 32 + 32 + 32 + 32 + 32 + 32 + 1;
}

#[account]
pub struct AvatarData {
    pub uri_ipfs_hash: String,
    pub creator: Pubkey,
    pub max_supply: u64,
    pub current_supply: u64,
    pub minting_fee_per_mint: u64,
    pub total_unclaimed_fees: u64,
    pub index: u64,
    pub bump: u8,
}

impl AvatarData {
    pub const MAX_IPFS_HASH_LEN: usize = 64;
    pub const INIT_SPACE: usize = 4 + Self::MAX_IPFS_HASH_LEN + 32 + 8 + 8 + 8 + 8 + 8 + 1;
}
