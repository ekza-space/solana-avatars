export interface AssetOrigin {
    title?: string;
    asset_type: string;
    author: {
        name: string;
        copyright?: string;
    };
    source?: {
        name?: string;
        url?: string;
        original_release_date?: string;
    };
    license: {
        type: string;
        name: string;
        url: string;
    };
    modifications?: {
        is_modified: boolean;
        modified_by?: string;
        notes?: string;
    };
    commercial_terms: {
        mint_fee_type?: string;
        mint_fee_note?: string;
        exclusive_rights_transferred: boolean;
    };
    provenance?: {
        minted_by?: string;
        mint_context?: string;
    };
}

export interface NftMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    animation_url: string;
    attributes: any[]; // TODO: define a stricter type if your attributes are always a known shape
    properties: {
        files: Array<{
            uri: string;
            type: string;
        }>;
        category: string;
        creators: Array<{
            address: string;
            share: number;
        }>;
    };
    asset_origin?: AssetOrigin;
}
