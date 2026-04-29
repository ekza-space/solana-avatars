use anchor_lang::prelude::*;

use crate::contexts::UpdateProfile;

pub fn update_profile(
    ctx: Context<UpdateProfile>,
    username: Option<[u8; 32]>,
    description: Option<[u8; 128]>,
) -> Result<()> {
    let profile = &mut ctx.accounts.profile;

    if let Some(v) = username {
        profile.username = v;
    }
    if let Some(v) = description {
        profile.description = v;
    }

    Ok(())
}
