import type { AssetOrigin } from "~/types/nft";
import type { AssetOriginTemplateId } from "~/constants/assetOrigin";
import { ASSET_ORIGIN_TEMPLATE_LABELS } from "~/constants/assetOrigin";

interface AssetOriginFormProps {
    value: AssetOrigin;
    onChange: (next: AssetOrigin) => void;
    templateId: AssetOriginTemplateId;
    onTemplateChange: (next: AssetOriginTemplateId) => void;
}

export default function AssetOriginForm({ value, onChange, templateId, onTemplateChange }: AssetOriginFormProps) {
    return (
        <div className="w-full max-w-3xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Asset origin template
                </label>
                <select
                    value={templateId}
                    onChange={(e) => onTemplateChange(e.target.value as AssetOriginTemplateId)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100"
                >
                    {Object.entries(ASSET_ORIGIN_TEMPLATE_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Title" value={value.title ?? ""} onChange={(title) => onChange({ ...value, title })} />
                <InputField label="Asset type *" value={value.asset_type} onChange={(asset_type) => onChange({ ...value, asset_type })} required />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                    label="Author name *"
                    value={value.author.name}
                    onChange={(name) => onChange({ ...value, author: { ...value.author, name } })}
                    required
                />
                <InputField
                    label="Author copyright"
                    value={value.author.copyright ?? ""}
                    onChange={(copyright) => onChange({ ...value, author: { ...value.author, copyright } })}
                />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                    label="Source name"
                    value={value.source?.name ?? ""}
                    onChange={(name) =>
                        onChange({ ...value, source: { ...(value.source ?? {}), name } })
                    }
                />
                <InputField
                    label="Source URL"
                    value={value.source?.url ?? ""}
                    onChange={(url) =>
                        onChange({ ...value, source: { ...(value.source ?? {}), url } })
                    }
                />
                <InputField
                    label="Original release date"
                    placeholder="YYYY-MM-DD"
                    value={value.source?.original_release_date ?? ""}
                    onChange={(original_release_date) =>
                        onChange({
                            ...value,
                            source: { ...(value.source ?? {}), original_release_date },
                        })
                    }
                />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                    label="License type *"
                    value={value.license.type}
                    onChange={(type) => onChange({ ...value, license: { ...value.license, type } })}
                    required
                />
                <InputField
                    label="License name *"
                    value={value.license.name}
                    onChange={(name) => onChange({ ...value, license: { ...value.license, name } })}
                    required
                />
                <InputField
                    label="License URL *"
                    value={value.license.url}
                    onChange={(url) => onChange({ ...value, license: { ...value.license, url } })}
                    required
                />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CheckboxField
                    label="Asset was modified"
                    checked={value.modifications?.is_modified ?? false}
                    onChange={(is_modified) =>
                        onChange({
                            ...value,
                            modifications: {
                                ...(value.modifications ?? { modified_by: "" }),
                                is_modified,
                            },
                        })
                    }
                />
                <InputField
                    label="Modified by"
                    value={value.modifications?.modified_by ?? ""}
                    onChange={(modified_by) =>
                        onChange({
                            ...value,
                            modifications: {
                                ...(value.modifications ?? { is_modified: false }),
                                modified_by,
                            },
                        })
                    }
                />
                <InputField
                    label="Modification notes"
                    value={value.modifications?.notes ?? ""}
                    onChange={(notes) =>
                        onChange({
                            ...value,
                            modifications: {
                                ...(value.modifications ?? { is_modified: false }),
                                notes,
                            },
                        })
                    }
                />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                    label="Mint fee type"
                    value={value.commercial_terms.mint_fee_type ?? ""}
                    onChange={(mint_fee_type) =>
                        onChange({
                            ...value,
                            commercial_terms: {
                                ...value.commercial_terms,
                                mint_fee_type,
                            },
                        })
                    }
                />
                <InputField
                    label="Mint fee note"
                    value={value.commercial_terms.mint_fee_note ?? ""}
                    onChange={(mint_fee_note) =>
                        onChange({
                            ...value,
                            commercial_terms: {
                                ...value.commercial_terms,
                                mint_fee_note,
                            },
                        })
                    }
                />
                <CheckboxField
                    label="Exclusive rights transferred"
                    checked={value.commercial_terms.exclusive_rights_transferred}
                    onChange={(exclusive_rights_transferred) =>
                        onChange({
                            ...value,
                            commercial_terms: {
                                ...value.commercial_terms,
                                exclusive_rights_transferred,
                            },
                        })
                    }
                />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                    label="Provenance: minted by"
                    value={value.provenance?.minted_by ?? ""}
                    onChange={(minted_by) =>
                        onChange({
                            ...value,
                            provenance: { ...(value.provenance ?? {}), minted_by },
                        })
                    }
                />
                <InputField
                    label="Provenance: mint context"
                    value={value.provenance?.mint_context ?? ""}
                    onChange={(mint_context) =>
                        onChange({
                            ...value,
                            provenance: { ...(value.provenance ?? {}), mint_context },
                        })
                    }
                />
            </section>
        </div>
    );
}

interface InputFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    placeholder?: string;
}

function InputField({ label, value, onChange, required, placeholder }: InputFieldProps) {
    return (
        <label className="block text-sm text-gray-700 dark:text-gray-200">
            <span className="font-medium">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            <input
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100"
            />
        </label>
    );
}

interface CheckboxFieldProps {
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}

function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
    return (
        <label className="inline-flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-200">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            />
            <span>{label}</span>
        </label>
    );
}

interface AssetOriginSummaryProps {
    assetOrigin: AssetOrigin;
}

export function AssetOriginSummary({ assetOrigin }: AssetOriginSummaryProps) {
    const exclusive = assetOrigin.commercial_terms.exclusive_rights_transferred;
    const isModified = assetOrigin.modifications?.is_modified ?? false;
    return (
        <div className="w-full max-w-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <h3 className="text-base font-semibold">License & provenance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SummaryItem label="Author" value={assetOrigin.author.name || "—"} />
                <SummaryItem label="License" value={`${assetOrigin.license.name} (${assetOrigin.license.type})`} />
                <SummaryItem label="Source" value={assetOrigin.source?.name || assetOrigin.source?.url || "—"} />
                <SummaryItem label="Asset modified" value={isModified ? "Yes" : "No"} />
                <SummaryItem label="Exclusive rights transferred" value={exclusive ? "Yes" : "No"} />
            </div>
            {!exclusive && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                    Purchaser does not receive exclusive rights to the source asset unless otherwise stated.
                </p>
            )}
        </div>
    );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
            <p className="font-medium break-words">{value || "—"}</p>
        </div>
    );
}
