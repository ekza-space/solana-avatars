use anchor_lang::prelude::*;

use crate::{contexts::ClaimFee, error::CustomError};

pub fn claim_fee(ctx: Context<ClaimFee>) -> Result<()> {
    let avatar_data = &mut ctx.accounts.avatar_data;
    let creator_info = ctx.accounts.creator.to_account_info();
    let escrow_info = ctx.accounts.escrow.to_account_info();

    let fees_to_claim = avatar_data.total_unclaimed_fees;
    require!(fees_to_claim > 0, CustomError::NoFeesToClaim);
    require!(
        escrow_info.lamports() >= fees_to_claim,
        CustomError::InsufficientEscrowBalance
    );

    let creator_new_balance = creator_info
        .lamports()
        .checked_add(fees_to_claim)
        .ok_or(CustomError::NumericalOverflow)?;
    let escrow_new_balance = escrow_info
        .lamports()
        .checked_sub(fees_to_claim)
        .ok_or(CustomError::InsufficientEscrowBalance)?;

    **creator_info.try_borrow_mut_lamports()? = creator_new_balance;
    **escrow_info.try_borrow_mut_lamports()? = escrow_new_balance;

    avatar_data.total_unclaimed_fees = 0;

    msg!(
        "Fees of {} lamports claimed by creator {} from escrow {}",
        fees_to_claim,
        creator_info.key(),
        escrow_info.key()
    );
    Ok(())
}
