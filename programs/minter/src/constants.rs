use anchor_lang::prelude::*;

#[constant]
pub const AVATAR_SEED: &[u8] = b"avatar_v1";

#[constant]
pub const ESCROW_SEED: &[u8] = b"avatar_escrow";

#[constant]
pub const STELLAR_LINK_SEED: &[u8] = b"stellar_avatar_link";

#[constant]
pub const STELLAR_RELEASE_LINK_SEED: &[u8] = b"stellar_release_link";

// NOTE: all solana-stellar layout knowledge (program id, account structs,
// statuses, CPI discriminators) now comes from the `solana-stellar` crate
// dependency (`solana_stellar::ID`, `state::*`, `cpi::*`) — never hand-code
// offsets or discriminators here again.
