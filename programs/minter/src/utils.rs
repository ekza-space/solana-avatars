//! The Stellar gate — Avatars side.
//!
//! Everything here goes through the `solana-stellar` crate (typed `state::*`
//! accounts + generated `cpi::*` clients), never hand-rolled offsets or
//! discriminators: if the upstream `Release` layout or instruction signatures
//! change, this file fails to COMPILE instead of silently reading garbage.
//! Gate contract: see solana-stellar/docs/INTEGRATION.md.

use anchor_lang::prelude::*;
use anchor_spl::metadata::mpl_token_metadata;
use solana_stellar::state::{Release, ReleaseStatus};

use crate::error::CustomError;

/// Identity of a validated Stellar release, as read from the typed account.
pub struct StellarReleaseOrigin {
    pub universe: Pubkey,
    pub asset: Pubkey,
    pub vault: Pubkey,
    pub status: ReleaseStatus,
}

pub fn metadata_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"metadata", mpl_token_metadata::ID.as_ref(), mint.as_ref()],
        &mpl_token_metadata::ID,
    )
    .0
}

pub fn uri_matches_avatar_hash(uri: &str, hash: &str) -> bool {
    uri == hash || uri.strip_prefix("ipfs://") == Some(hash)
}

/// Validate a solana-stellar `Release` account and return its identity.
/// Discriminator + layout are enforced by the typed `try_deserialize`.
pub fn validate_stellar_release<'info>(
    stellar_program: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
) -> Result<StellarReleaseOrigin> {
    require_keys_eq!(
        *stellar_program.key,
        solana_stellar::ID,
        CustomError::InvalidStellarProgram
    );
    require!(
        stellar_program.executable,
        CustomError::InvalidStellarProgram
    );
    require_keys_eq!(
        *release.owner,
        solana_stellar::ID,
        CustomError::InvalidStellarRelease
    );

    let release_data = release.try_borrow_data()?;
    let release_account = Release::try_deserialize(&mut release_data.as_ref())
        .map_err(|_| CustomError::InvalidStellarRelease)?;

    require_keys_eq!(
        release_account.vault,
        *vault.key,
        CustomError::InvalidStellarVault
    );
    require!(
        matches!(
            release_account.status,
            ReleaseStatus::Finalized | ReleaseStatus::Linked
        ),
        CustomError::InvalidStellarRelease
    );

    Ok(StellarReleaseOrigin {
        universe: release_account.universe,
        asset: release_account.asset,
        vault: release_account.vault,
        status: release_account.status,
    })
}

/// CPI `deposit_revenue`: route mint fees into the Stellar release vault.
pub fn deposit_revenue_to_stellar<'info>(
    amount: u64,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    stellar_program: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
) -> Result<()> {
    solana_stellar::cpi::deposit_revenue(
        CpiContext::new(
            stellar_program.clone(),
            solana_stellar::cpi::accounts::DepositRevenue {
                release: release.clone(),
                vault: vault.clone(),
                payer: payer.clone(),
                system_program: system_program.clone(),
            },
        ),
        amount,
    )
}

/// CPI `link_avatar_data`: bind the AvatarData back into the Stellar release
/// (Finalized → Linked). Signer must be the universe owner.
pub fn link_avatar_data_to_stellar<'info>(
    avatar_data: Pubkey,
    owner: &AccountInfo<'info>,
    stellar_program: &AccountInfo<'info>,
    universe: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
) -> Result<()> {
    solana_stellar::cpi::link_avatar_data(
        CpiContext::new(
            stellar_program.clone(),
            solana_stellar::cpi::accounts::LinkAvatarData {
                universe: universe.clone(),
                release: release.clone(),
                owner: owner.clone(),
            },
        ),
        avatar_data,
    )
}
