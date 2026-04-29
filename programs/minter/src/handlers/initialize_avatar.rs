use anchor_lang::prelude::*;

use crate::{contexts::InitializeAvatar, error::CustomError, state::AvatarData};

pub fn initialize_avatar(
    ctx: Context<InitializeAvatar>,
    uri_ipfs_hash: String,
    max_supply: u64,
    minting_fee_per_mint: u64,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.bump = ctx.bumps.registry;

    let index = registry.next_index;
    registry.next_index = registry
        .next_index
        .checked_add(1)
        .ok_or(CustomError::NumericalOverflow)?;

    require!(
        !uri_ipfs_hash.is_empty() && uri_ipfs_hash.len() <= AvatarData::MAX_IPFS_HASH_LEN,
        CustomError::InvalidIpfsHashLength
    );
    require!(max_supply > 0, CustomError::InvalidMaxSupply);

    let avatar_data = &mut ctx.accounts.avatar_data;
    avatar_data.uri_ipfs_hash = uri_ipfs_hash.clone();
    avatar_data.creator = *ctx.accounts.payer.key;
    avatar_data.max_supply = max_supply;
    avatar_data.current_supply = 0;
    avatar_data.minting_fee_per_mint = minting_fee_per_mint;
    avatar_data.total_unclaimed_fees = 0;
    avatar_data.bump = ctx.bumps.avatar_data;
    avatar_data.index = index;
    ctx.accounts.escrow.bump = ctx.bumps.escrow;

    msg!(
        "Avatar PDA initialized for IPFS hash: {}, Max Supply: {}, Fee per Mint: {}",
        avatar_data.uri_ipfs_hash,
        avatar_data.max_supply,
        avatar_data.minting_fee_per_mint
    );
    Ok(())
}
