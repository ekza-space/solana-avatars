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
}