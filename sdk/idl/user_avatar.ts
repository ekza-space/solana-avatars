/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/user_avatar.json`.
 */
export type UserAvatar = {
  "address": "56kfTdE1xmCkZ2eDuikD7S5Mr15nmdzQENDWfmdMVtt",
  "metadata": {
    "name": "userAvatar",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createUserAvatar",
      "docs": [
        "Create a new user avatar."
      ],
      "discriminator": [
        157,
        239,
        45,
        19,
        235,
        120,
        44,
        254
      ],
      "accounts": [
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  118,
                  97,
                  116,
                  97,
                  114,
                  95,
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "avatar",
          "writable": true
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
          "name": "avatar2dHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "avatar3dHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "deleteUserAvatar",
      "docs": [
        "Delete a user avatar and close the account, returning lamports to the owner."
      ],
      "discriminator": [
        248,
        190,
        136,
        154,
        164,
        57,
        72,
        204
      ],
      "accounts": [
        {
          "name": "avatar",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "avatar"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize the avatar counter. Called once by the program deployer."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  118,
                  97,
                  116,
                  97,
                  114,
                  95,
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateUserAvatar",
      "docs": [
        "Update an existing user avatar (partial updates allowed)."
      ],
      "discriminator": [
        140,
        141,
        191,
        247,
        148,
        174,
        161,
        75
      ],
      "accounts": [
        {
          "name": "avatar",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "avatar"
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
          "name": "avatar2dHash",
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
          "name": "avatar3dHash",
          "type": {
            "option": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "avatarCounter",
      "discriminator": [
        252,
        222,
        67,
        2,
        195,
        79,
        32,
        242
      ]
    },
    {
      "name": "userAvatar",
      "discriminator": [
        180,
        224,
        132,
        103,
        74,
        206,
        106,
        93
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "idOverflow",
      "msg": "Counter overflow"
    }
  ],
  "types": [
    {
      "name": "avatarCounter",
      "docs": [
        "AvatarCounter PDA account: seeds = [\"avatar_counter\"]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nextId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userAvatar",
      "docs": [
        "UserAvatar PDA account: seeds = [\"user_id\", id.to_le_bytes()]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
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
            "name": "avatar2dHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "avatar3dHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
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
