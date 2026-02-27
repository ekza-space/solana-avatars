import type { AssetOrigin } from "~/types/nft";

export type AssetOriginTemplateId =
    | "everything-animals"
    | "everything-buildings"
    | "custom";

export const ASSET_ORIGIN_TEMPLATE_LABELS: Record<AssetOriginTemplateId, string> = {
    "everything-animals": "Everything Library – Animals",
    "everything-buildings": "Everything Library – Buildings",
    "custom": "Custom",
};

export function createAssetOriginTemplate(
    template: AssetOriginTemplateId,
    platformName: string
): AssetOrigin {
    switch (template) {
        case "everything-animals":
            return {
                title: "Everything Library - ANIMALS 0.1",
                asset_type: "3d_model",
                author: {
                    name: "David OReilly",
                    copyright: "Everything Library © David OReilly",
                },
                source: {
                    name: "Everything Library",
                    url: "http://davidoreilly.com/library",
                    original_release_date: "2020-08-02",
                },
                license: {
                    type: "CC_BY_4_0",
                    name: "Creative Commons Attribution 4.0 International",
                    url: "https://creativecommons.org/licenses/by/4.0/",
                },
                modifications: {
                    is_modified: true,
                    modified_by: platformName,
                    notes: "Optimized, repackaged, and prepared for minting",
                },
                commercial_terms: {
                    mint_fee_type: "service_fee",
                    mint_fee_note: "Fee covers minting, hosting, and platform services only",
                    exclusive_rights_transferred: false,
                },
                provenance: {
                    minted_by: platformName,
                    mint_context: "NFT mint via platform",
                },
            };
        case "everything-buildings":
            return {
                title: "Everything Library - BUILDINGS 0.1",
                asset_type: "3d_model",
                author: {
                    name: "David OReilly",
                    copyright: "Everything Library © David OReilly",
                },
                source: {
                    name: "Everything Library",
                    url: "http://davidoreilly.com/library",
                    original_release_date: "2020-08-02",
                },
                license: {
                    type: "CC_BY_4_0",
                    name: "Creative Commons Attribution 4.0 International",
                    url: "https://creativecommons.org/licenses/by/4.0/",
                },
                modifications: {
                    is_modified: true,
                    modified_by: platformName,
                    notes: "Optimized, repackaged, and prepared for minting",
                },
                commercial_terms: {
                    mint_fee_type: "service_fee",
                    mint_fee_note: "Fee covers minting, hosting, and platform services only",
                    exclusive_rights_transferred: false,
                },
                provenance: {
                    minted_by: platformName,
                    mint_context: "NFT mint via platform",
                },
            };
        case "custom":
        default:
            return {
                title: "",
                asset_type: "3d_model",
                author: {
                    name: platformName,
                },
                source: {
                    name: "",
                    url: "",
                    original_release_date: "",
                },
                license: {
                    type: "",
                    name: "",
                    url: "",
                },
                modifications: {
                    is_modified: false,
                    modified_by: platformName,
                    notes: "",
                },
                commercial_terms: {
                    mint_fee_type: "service_fee",
                    mint_fee_note: "Fee covers minting, hosting, and platform services only",
                    exclusive_rights_transferred: false,
                },
                provenance: {
                    minted_by: platformName,
                    mint_context: "NFT mint via platform",
                },
            };
    }
}
