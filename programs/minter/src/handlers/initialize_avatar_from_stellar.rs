use anchor_lang::prelude::*;

use crate::{
    constants::{RELEASE_STATUS_FINALIZED, RELEASE_STATUS_LINKED},
    contexts::InitializeAvatarFromStellar,
    error::CustomError,
    state::AvatarData,
    utils::{link_avatar_data_to_stellar, validate_stellar_release},
};

pub fn initialize_avatar_from_stellar(
    ctx: Context<InitializeAvatarFromStellar>,
    uri_ipfs_hash: String,
    max_supply: u64,
    minting_fee_per_mint: u64,
) -> Result<()> {
    let origin = validate_stellar_release(
        &ctx.accounts.stellar_program,
        &ctx.accounts.stellar_release,
        &ctx.accounts.stellar_vault,
    )?;
    require_keys_eq!(
        origin.universe,
        ctx.accounts.stellar_universe.key(),
        CustomError::InvalidStellarRelease
    );
    require!(
        origin.status == RELEASE_STATUS_FINALIZED
            || origin.status == RELEASE_STATUS_LINKED,
        CustomError::InvalidStellarRelease
    );
    msg!(
        "initialize_avatar_from_stellar: release {} status={} origin_universe {} arg_universe {}",
        ctx.accounts.stellar_release.key(),
        origin.status,
        origin.universe,
        ctx.accounts.stellar_universe.key()
    );

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
    stellar_link.universe = origin.universe;
    stellar_link.asset = origin.asset;
    stellar_link.release = ctx.accounts.stellar_release.key();
    stellar_link.vault = origin.vault;
    stellar_link.bump = ctx.bumps.stellar_link;

    let stellar_release_link = &mut ctx.accounts.stellar_release_link;
    stellar_release_link.release = ctx.accounts.stellar_release.key();
    stellar_release_link.stellar_program = ctx.accounts.stellar_program.key();
    stellar_release_link.universe = origin.universe;
    stellar_release_link.asset = origin.asset;
    stellar_release_link.vault = origin.vault;
    stellar_release_link.avatar_data = avatar_data.key();
    stellar_release_link.bump = ctx.bumps.stellar_release_link;

    if origin.status == RELEASE_STATUS_FINALIZED {
        link_avatar_data_to_stellar(
            avatar_data.key(),
            &ctx.accounts.payer.to_account_info(),
            &ctx.accounts.stellar_program,
            &ctx.accounts.stellar_universe,
            &ctx.accounts.stellar_release,
        )?;
    }

    msg!(
        "Stellar-linked Avatar PDA initialized for IPFS hash: {}, release: {}",
        avatar_data.uri_ipfs_hash,
        stellar_link.release
    );
    Ok(())
}
