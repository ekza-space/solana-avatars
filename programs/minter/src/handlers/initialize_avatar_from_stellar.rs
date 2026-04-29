use anchor_lang::prelude::*;

use crate::{
    contexts::InitializeAvatarFromStellar, error::CustomError, state::AvatarData,
    utils::validate_stellar_release,
};

pub fn initialize_avatar_from_stellar(
    ctx: Context<InitializeAvatarFromStellar>,
    uri_ipfs_hash: String,
    max_supply: u64,
    minting_fee_per_mint: u64,
) -> Result<()> {
    validate_stellar_release(
        &ctx.accounts.stellar_program,
        &ctx.accounts.stellar_release,
        &ctx.accounts.stellar_vault,
    )?;

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
    avatar_data.creator = Pubkey::default();
    avatar_data.max_supply = max_supply;
    avatar_data.current_supply = 0;
    avatar_data.minting_fee_per_mint = minting_fee_per_mint;
    avatar_data.total_unclaimed_fees = 0;
    avatar_data.bump = ctx.bumps.avatar_data;
    avatar_data.index = index;

    ctx.accounts.escrow.bump = ctx.bumps.escrow;

    let stellar_link = &mut ctx.accounts.stellar_link;
    stellar_link.avatar_data = avatar_data.key();
    stellar_link.stellar_program = ctx.accounts.stellar_program.key();
    stellar_link.release = ctx.accounts.stellar_release.key();
    stellar_link.vault = ctx.accounts.stellar_vault.key();
    stellar_link.bump = ctx.bumps.stellar_link;

    msg!(
        "Stellar-linked Avatar PDA initialized for IPFS hash: {}, release: {}",
        avatar_data.uri_ipfs_hash,
        stellar_link.release
    );
    Ok(())
}
