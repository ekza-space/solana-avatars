use anchor_lang::prelude::*;

declare_id!("EpvYvvpnt7SX22w76HyAjZ2Hu71j9eaPvnDgyRxfhiQR");

#[program]
pub mod tst2 {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
