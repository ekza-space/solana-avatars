/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/avatar_nft_minter.json`.
 */
export type AvatarNftMinter = {
  "address": "EXmcLULN3Nx9kwkYZmv1cPxKr74mPjuMwfoKGsJ6Npb",
  "metadata": {
    "name": "avatarNftMinter",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claimFee",
      "discriminator": [
        169,
        32,
        79,
        137,
        136,
        232,
        70,
        137
      ],
      "accounts": [
        {
          "name": "avatarData",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "avatarData"
          ]
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeAvatar",
      "discriminator": [
        234,
        87,
        220,
        236,
        146,
        157,
        181,
        84
      ],
      "accounts": [
        {
          "name": "avatarData",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ipfsHash",
          "type": "string"
        },
        {
          "name": "maxSupply",
          "type": "u64"
        },
        {
          "name": "mintingFeePerMint",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mintNft",
      "discriminator": [
        211,
        57,
        6,
        167,
        15,
        219,
        35,
        251
      ],
      "accounts": [
        {
          "name": "avatarData",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metadataAccount",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "avatarData",
      "discriminator": [
        127,
        237,
        205,
        27,
        232,
        44,
        87,
        218
      ]
    },
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidIpfsHashLength",
      "msg": "Invalid IPFS hash length."
    },
    {
      "code": 6001,
      "name": "maxSupplyReached",
      "msg": "Maximum supply for this avatar has been reached."
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Unauthorized action."
    },
    {
      "code": 6003,
      "name": "noFeesToClaim",
      "msg": "No fees have been accumulated to claim."
    },
    {
      "code": 6004,
      "name": "numericalOverflow",
      "msg": "Numerical overflow occurred."
    },
    {
      "code": 6005,
      "name": "insufficientEscrowBalance",
      "msg": "Escrow balance insufficient to cover fees and rent."
    }
  ],
  "types": [
    {
      "name": "avatarData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "currentSupply",
            "type": "u64"
          },
          {
            "name": "mintingFeePerMint",
            "type": "u64"
          },
          {
            "name": "totalUnclaimedFees",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "escrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "avatarSeed",
      "type": "bytes",
      "value": "[97, 118, 97, 116, 97, 114, 95, 118, 49]"
    },
    {
      "name": "escrowSeed",
      "type": "bytes",
      "value": "[97, 118, 97, 116, 97, 114, 95, 101, 115, 99, 114, 111, 119]"
    }
  ]
};
