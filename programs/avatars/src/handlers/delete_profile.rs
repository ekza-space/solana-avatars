use anchor_lang::prelude::*;

use crate::contexts::DeleteProfile;

pub fn delete_profile(_ctx: Context<DeleteProfile>) -> Result<()> {
    Ok(())
}
