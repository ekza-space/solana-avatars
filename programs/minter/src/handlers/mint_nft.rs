use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke, system_instruction},
};
use anchor_spl::{
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::types::{Creator, DataV2},
        CreateMetadataAccountsV3,
    },
    token::{mint_to, set_authority, spl_token::instruction::AuthorityType, MintTo, SetAuthority},
};

use crate::{
    constants::STELLAR_LINK_SEED,
    contexts::MintNft,
    error::CustomError,
    state::{AvatarData, StellarAvatarLink},
    utils::{
        deposit_revenue_to_stellar, metadata_pda, uri_matches_avatar_hash, validate_stellar_release,
    },
};

pub fn mint_nft<'info>(
    ctx: Context<'_, '_, 'info, 'info, MintNft<'info>>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let payer = &ctx.accounts.payer;

    require!(
        uri_matches_avatar_hash(&uri, &ctx.accounts.avatar_data.uri_ipfs_hash),
        CustomError::InvalidMetadataUri
    );

    let expected_metadata = metadata_pda(&ctx.accounts.mint.key());
    require_keys_eq!(
        ctx.accounts.metadata_account.key(),
        expected_metadata,
        CustomError::InvalidMetadataAccount
    );

    require!(
        ctx.accounts.avatar_data.current_supply < ctx.accounts.avatar_data.max_supply,
        CustomError::MaxSupplyReached
    );

    if ctx.accounts.avatar_data.minting_fee_per_mint > 0 {
        let payer_info = payer.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let escrow_info = ctx.accounts.escrow.to_account_info();
        route_mint_fee(
            ctx.program_id,
            ctx.remaining_accounts,
            &mut ctx.accounts.avatar_data,
            &payer_info,
            &system_program_info,
            &escrow_info,
        )?;
    }

    let cpi_accounts_mint_to = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.token_account.to_account_info(),
        authority: payer.to_account_info(),
    };
    let cpi_program_token = ctx.accounts.token_program.to_account_info();
    let cpi_ctx_mint_to = CpiContext::new(cpi_program_token, cpi_accounts_mint_to);
    mint_to(cpi_ctx_mint_to, 1)?;

    msg!("NFT token minted to: {}", ctx.accounts.token_account.key());

    let cpi_context_metadata = CpiContext::new(
        ctx.accounts.token_metadata_program.to_account_info(),
        CreateMetadataAccountsV3 {
            metadata: ctx.accounts.metadata_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            mint_authority: payer.to_account_info(),
            payer: payer.to_account_info(),
            update_authority: payer.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        },
    );

    let creators = if ctx.accounts.avatar_data.creator == Pubkey::default() {
        None
    } else {
        Some(vec![Creator {
            address: ctx.accounts.avatar_data.creator,
            verified: false,
            share: 100,
        }])
    };

    let data_v2 = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators,
        collection: None,
        uses: None,
    };

    create_metadata_accounts_v3(cpi_context_metadata, data_v2, false, true, None)?;

    let cpi_program_token = ctx.accounts.token_program.to_account_info();
    let revoke_mint_ctx = CpiContext::new(
        cpi_program_token.clone(),
        SetAuthority {
            account_or_mint: ctx.accounts.mint.to_account_info(),
            current_authority: payer.to_account_info(),
        },
    );
    set_authority(revoke_mint_ctx, AuthorityType::MintTokens, None)?;

    let revoke_freeze_ctx = CpiContext::new(
        cpi_program_token,
        SetAuthority {
            account_or_mint: ctx.accounts.mint.to_account_info(),
            current_authority: payer.to_account_info(),
        },
    );
    set_authority(revoke_freeze_ctx, AuthorityType::FreezeAccount, None)?;

    ctx.accounts.avatar_data.current_supply = ctx
        .accounts
        .avatar_data
        .current_supply
        .checked_add(1)
        .ok_or(CustomError::NumericalOverflow)?;

    msg!(
        "NFT metadata created for mint: {}. Current supply for PDA: {}/{}",
        ctx.accounts.mint.to_account_info().key(),
        ctx.accounts.avatar_data.current_supply,
        ctx.accounts.avatar_data.max_supply
    );
    Ok(())
}

fn route_mint_fee<'info>(
    program_id: &Pubkey,
    remaining_accounts: &'info [AccountInfo<'info>],
    avatar_data: &mut Account<'info, AvatarData>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    escrow: &AccountInfo<'info>,
) -> Result<()> {
    let fee_to_pay = avatar_data.minting_fee_per_mint;

    if avatar_data.creator == Pubkey::default() {
        require!(
            remaining_accounts.len() == 4,
            CustomError::MissingStellarLink
        );

        let stellar_link_info = &remaining_accounts[0];
        let stellar_program = &remaining_accounts[1];
        let stellar_release = &remaining_accounts[2];
        let stellar_vault = &remaining_accounts[3];
        let stellar_link = Account::<StellarAvatarLink>::try_from(stellar_link_info)?;
        let (expected_stellar_link, _) = Pubkey::find_program_address(
            &[STELLAR_LINK_SEED, avatar_data.key().as_ref()],
            program_id,
        );

        require_keys_eq!(
            stellar_link_info.key(),
            expected_stellar_link,
            CustomError::InvalidStellarLink
        );
        require_keys_eq!(
            stellar_link.avatar_data,
            avatar_data.key(),
            CustomError::InvalidStellarLink
        );
        require_keys_eq!(
            stellar_link.stellar_program,
            *stellar_program.key,
            CustomError::InvalidStellarProgram
        );
        require_keys_eq!(
            stellar_link.release,
            *stellar_release.key,
            CustomError::InvalidStellarRelease
        );
        require_keys_eq!(
            stellar_link.vault,
            *stellar_vault.key,
            CustomError::InvalidStellarVault
        );
        validate_stellar_release(stellar_program, stellar_release, stellar_vault)?;

        deposit_revenue_to_stellar(
            fee_to_pay,
            payer,
            system_program,
            stellar_program,
            stellar_release,
            stellar_vault,
        )?;

        msg!(
            "Deposited {} lamports mint fee into Stellar release vault {}",
            fee_to_pay,
            stellar_vault.key()
        );
    } else {
        let escrow_key = escrow.key();
        let ix = system_instruction::transfer(payer.key, &escrow_key, fee_to_pay);

        invoke(
            &ix,
            &[payer.clone(), escrow.clone(), system_program.clone()],
        )?;

        avatar_data.total_unclaimed_fees = avatar_data
            .total_unclaimed_fees
            .checked_add(fee_to_pay)
            .ok_or(CustomError::NumericalOverflow)?;

        msg!(
            "Transferred {} lamports fee to escrow PDA {}",
            fee_to_pay,
            escrow_key
        );
    }

    Ok(())
}
