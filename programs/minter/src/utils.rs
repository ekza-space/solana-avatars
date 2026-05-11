use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke,
    },
};
use anchor_spl::metadata::mpl_token_metadata;
use sha2::{Digest, Sha256};

use crate::{
    constants::{
        RELEASE_ASSET_OFFSET, RELEASE_STATUS_FINALIZED, RELEASE_STATUS_LINKED,
        RELEASE_STATUS_OFFSET, RELEASE_UNIVERSE_OFFSET, RELEASE_VAULT_OFFSET,
        SOLANA_STELLAR_PROGRAM_ID,
    },
    error::CustomError,
};

pub struct StellarReleaseOrigin {
    pub universe: Pubkey,
    pub asset: Pubkey,
    pub vault: Pubkey,
    pub status: u8,
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

fn anchor_discriminator(ix_name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("global:{ix_name}").as_bytes());
    let hash = hasher.finalize();
    let mut discriminator = [0_u8; 8];
    discriminator.copy_from_slice(&hash[..8]);
    discriminator
}

fn anchor_account_discriminator(account_name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("account:{account_name}").as_bytes());
    let hash = hasher.finalize();
    let mut discriminator = [0_u8; 8];
    discriminator.copy_from_slice(&hash[..8]);
    discriminator
}

pub fn validate_stellar_release<'info>(
    stellar_program: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
) -> Result<StellarReleaseOrigin> {
    require_keys_eq!(
        *stellar_program.key,
        SOLANA_STELLAR_PROGRAM_ID,
        CustomError::InvalidStellarProgram
    );
    require!(
        stellar_program.executable,
        CustomError::InvalidStellarProgram
    );
    require_keys_eq!(
        *release.owner,
        *stellar_program.key,
        CustomError::InvalidStellarRelease
    );

    let release_data = release.try_borrow_data()?;
    require!(
        release_data.len() > RELEASE_STATUS_OFFSET,
        CustomError::InvalidStellarRelease
    );
    let release_discriminator = anchor_account_discriminator("Release");
    require!(
        release_data.get(..8) == Some(release_discriminator.as_ref()),
        CustomError::InvalidStellarRelease
    );

    let read_pubkey = |offset: usize| -> Pubkey {
        let mut bytes = [0_u8; 32];
        bytes.copy_from_slice(&release_data[offset..offset + 32]);
        Pubkey::new_from_array(bytes)
    };

    let stored_universe = read_pubkey(RELEASE_UNIVERSE_OFFSET);
    let stored_asset = read_pubkey(RELEASE_ASSET_OFFSET);
    let stored_vault = read_pubkey(RELEASE_VAULT_OFFSET);
    require_keys_eq!(stored_vault, *vault.key, CustomError::InvalidStellarVault);

    let status = release_data[RELEASE_STATUS_OFFSET];
    require!(
        status == RELEASE_STATUS_FINALIZED || status == RELEASE_STATUS_LINKED,
        CustomError::InvalidStellarRelease
    );

    Ok(StellarReleaseOrigin {
        universe: stored_universe,
        asset: stored_asset,
        vault: stored_vault,
        status,
    })
}

pub fn deposit_revenue_to_stellar<'info>(
    amount: u64,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    stellar_program: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
) -> Result<()> {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&anchor_discriminator("deposit_revenue"));
    data.extend_from_slice(&amount.to_le_bytes());

    let ix = Instruction {
        program_id: *stellar_program.key,
        accounts: vec![
            AccountMeta::new(*release.key, false),
            AccountMeta::new(*vault.key, false),
            AccountMeta::new(*payer.key, true),
            AccountMeta::new_readonly(*system_program.key, false),
        ],
        data,
    };

    invoke(
        &ix,
        &[
            release.clone(),
            vault.clone(),
            payer.clone(),
            system_program.clone(),
            stellar_program.clone(),
        ],
    )?;

    Ok(())
}

pub fn link_avatar_data_to_stellar<'info>(
    avatar_data: Pubkey,
    owner: &AccountInfo<'info>,
    stellar_program: &AccountInfo<'info>,
    universe: &AccountInfo<'info>,
    release: &AccountInfo<'info>,
) -> Result<()> {
    let mut data = Vec::with_capacity(40);
    data.extend_from_slice(&anchor_discriminator("link_avatar_data"));
    data.extend_from_slice(avatar_data.as_ref());

    let ix = Instruction {
        program_id: *stellar_program.key,
        accounts: vec![
            AccountMeta::new_readonly(*universe.key, false),
            AccountMeta::new(*release.key, false),
            AccountMeta::new_readonly(*owner.key, true),
        ],
        data,
    };

    invoke(
        &ix,
        &[
            universe.clone(),
            release.clone(),
            owner.clone(),
            stellar_program.clone(),
        ],
    )?;

    Ok(())
}
