#![allow(unexpected_cfgs)] // TODO: wtf?!
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

declare_id!("29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz");

#[program]
pub mod avatar_nft_minter {
    use super::*;

    pub fn initialize_avatar(
        ctx: Context<InitializeAvatar>,
        uri_ipfs_hash: String,
        max_supply: u64,
        minting_fee_per_mint: u64,
    ) -> Result<()> {
        handlers::initialize_avatar(ctx, uri_ipfs_hash, max_supply, minting_fee_per_mint)
    }

    pub fn initialize_avatar_from_stellar(
        ctx: Context<InitializeAvatarFromStellar>,
        uri_ipfs_hash: String,
        max_supply: u64,
        minting_fee_per_mint: u64,
    ) -> Result<()> {
        handlers::initialize_avatar_from_stellar(
            ctx,
            uri_ipfs_hash,
            max_supply,
            minting_fee_per_mint,
        )
    }

    pub fn mint_nft<'info>(
        ctx: Context<'_, '_, 'info, 'info, MintNft<'info>>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        handlers::mint_nft(ctx, name, symbol, uri)
    }

    pub fn claim_fee(ctx: Context<ClaimFee>) -> Result<()> {
        handlers::claim_fee(ctx)
    }
}
