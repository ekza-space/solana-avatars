/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/user_profile.json`.
 */
export type UserProfile = {
  "address": "56kfTdE1xmCkZ2eDuikD7S5Mr15nmdzQENDWfmdMVtt",
  "metadata": {
    "name": "userProfile",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "deleteProfile",
      "docs": [
        "Closes the profile PDA and returns lamports to the owner."
      ],
      "discriminator": [
        213,
        96,
        148,
        104,
        75,
        217,
        8,
        131
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "profile"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "initializeProfile",
      "docs": [
        "Creates the signer’s profile PDA. Fails if it already exists."
      ],
      "discriminator": [
        32,
        145,
        77,
        213,
        58,
        39,
        251,
        234
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "username",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "description",
          "type": {
            "array": [
              "u8",
              128
            ]
          }
        },
        {
          "name": "avatarMint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateProfile",
      "docs": [
        "Partial update of profile fields."
      ],
      "discriminator": [
        98,
        67,
        99,
        206,
        86,
        115,
        175,
        1
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "profile"
          ]
        }
      ],
      "args": [
        {
          "name": "username",
          "type": {
            "option": {
              "array": [
                "u8",
                32
              ]
            }
          }
        },
        {
          "name": "description",
          "type": {
            "option": {
              "array": [
                "u8",
                128
              ]
            }
          }
        },
        {
          "name": "avatarMint",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "userProfile",
      "discriminator": [
        32,
        37,
        119,
        205,
        179,
        180,
        13,
        194
      ]
    }
  ],
  "types": [
    {
      "name": "userProfile",
      "docs": [
        "One‑per‑user profile PDA: seeds = [\"profile\", owner]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "username",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "description",
            "type": {
              "array": [
                "u8",
                128
              ]
            }
          },
          {
            "name": "avatarMint",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
