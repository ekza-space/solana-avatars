use anchor_lang::prelude::*;

#[account]
pub struct UserProfile {
    pub owner: Pubkey,
    pub username: [u8; 32],
    pub description: [u8; 128],
    pub avatar_mint: Pubkey,
    pub created_at: i64,
}

impl UserProfile {
    pub const INIT_SPACE: usize = 32 + 32 + 128 + 32 + 8;
}
