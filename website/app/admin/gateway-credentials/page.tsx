"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileKey,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import styles from "./gateway-credentials.module.css";

type FieldType = "secret" | "text" | "mode";

type TemplateField = {
  key: string;
  label: string;
  type: FieldType;
  common: boolean;
  hasValue: boolean;
  value?: string;
};

type CredentialTemplate = {
  _id: string;
  name: string;
  fields: TemplateField[];
  fieldCount: number;
  usageCount: number;
  status: string;
  updatedAt: string;
};

type CustomField = {
  id: string;
  key: string;
  label: string;
  type: "secret" | "text";
  value: string;
  hasStoredValue?: boolean;
};

const commonFields = [
  { key: "apiKey", label: "API Key", type: "secret" as const },
  { key: "secretKey", label: "Secret Key", type: "secret" as const },
  {
    key: "webhookSecret",
    label: "Webhook Secret",
    type: "secret" as const,
  },
  { key: "mode", label: "Mode", type: "mode" as const },
];

function emptySelectedFields() {
  return {
    apiKey: false,
    secretKey: false,
    webhookSecret: false,
    mode: false,
  };
}

function emptyValues() {
  return {
    apiKey: "",
    secretKey: "",
    webhookSecret: "",
    mode: "production",
  };
}

function customFieldId() {
  return `field_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function suggestedKey(label: string) {
  const words = label
    .trim()
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words
    .map((word, index) => {
      const normalized = word.replace(/[^A-Za-z0-9]/g, "");
      if (index === 0) {
        return normalized.charAt(0).toLowerCase() + normalized.slice(1);
      }
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

export default function GatewayCredentialTemplatesPage() {
  const [templates, setTemplates] = useState<CredentialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(emptySelectedFields);
  const [values, setValues] = useState(emptyValues);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>(
    {}
  );
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        "/api/admin/gateway-credential-templates",
        { cache: "no-store", credentials: "include" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load credential templates");
      }
      setTemplates(data.templates || []);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load credential templates"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial remote data hydration is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTemplates();
  }, [loadTemplates]);

  const selectedCount = useMemo(
    () =>
      Object.values(selected).filter(Boolean).length + customFields.length,
    [customFields.length, selected]
  );

  function resetForm() {
    setEditingId("");
    setName("");
    setSelected(emptySelectedFields());
    setValues(emptyValues());
    setCustomFields([]);
    setVisibleSecrets({});
  }

  function editTemplate(template: CredentialTemplate) {
    const nextSelected = emptySelectedFields();
    const nextValues = emptyValues();
    const nextCustom: CustomField[] = [];

    for (const field of template.fields) {
      if (field.key in nextSelected) {
        nextSelected[field.key as keyof typeof nextSelected] = true;
        if (field.type === "mode") {
          nextValues.mode = field.value === "sandbox" ? "sandbox" : "production";
        }
      } else {
        nextCustom.push({
          id: customFieldId(),
          key: field.key,
          label: field.label,
          type: field.type === "text" ? "text" : "secret",
          value: "",
          hasStoredValue: field.hasValue,
        });
      }
    }

    setEditingId(template._id);
    setName(template.name);
    setSelected(nextSelected);
    setValues(nextValues);
    setCustomFields(nextCustom);
    setVisibleSecrets({});
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addCustomField() {
    setCustomFields((current) => [
      ...current,
      {
        id: customFieldId(),
        key: "",
        label: "",
        type: "secret",
        value: "",
      },
    ]);
  }

  function updateCustomField(
    id: string,
    field: keyof CustomField,
    value: string
  ) {
    setCustomFields((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (field === "label" && (!item.key || item.key === suggestedKey(item.label))) {
          return { ...item, label: value, key: suggestedKey(value) };
        }
        return { ...item, [field]: value };
      })
    );
  }

  function buildFields() {
    const fields = commonFields
      .filter((field) => selected[field.key as keyof typeof selected])
      .map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        value: values[field.key as keyof typeof values],
      }));

    return [
      ...fields,
      ...customFields.map((field) => ({
        key: field.key.trim(),
        label: field.label.trim(),
        type: field.type,
        value: field.value,
      })),
    ];
  }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!name.trim()) {
      setMessageType("error");
      setMessage("Enter a template name.");
      return;
    }
    if (!selectedCount) {
      setMessageType("error");
      setMessage("Select at least one credential field.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/gateway-credential-templates/${editingId}`
          : "/api/admin/gateway-credential-templates",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: name.trim(), fields: buildFields() }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not save credential template");
      }
      setMessageType("success");
      setMessage(data.message || "Credential template saved.");
      resetForm();
      await loadTemplates();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save credential template"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(template: CredentialTemplate) {
    if (
      !window.confirm(
        `Delete "${template.name}"? Templates attached to a MID cannot be deleted.`
      )
    ) {
      return;
    }
    try {
      const response = await fetch(
        `/api/admin/gateway-credential-templates/${template._id}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not delete template");
      }
      setMessageType("success");
      setMessage(data.message || "Credential template deleted.");
      if (editingId === template._id) resetForm();
      await loadTemplates();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Could not delete template"
      );
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Gateway infrastructure</p>
            <h1>Credential templates</h1>
            <p className={styles.intro}>
              Define a credential structure once, protect its values, and reuse
              it across MID pools.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={loadTemplates}
              aria-label="Refresh credential templates"
              title="Refresh"
            >
              <RefreshCw className={loading ? styles.spinning : ""} size={18} />
            </button>
            <Link className={styles.primaryLink} href="/admin/mid-pools">
              Manage MID pools
              <ChevronRight size={17} />
            </Link>
          </div>
        </header>

        {message ? (
          <div
            className={`${styles.message} ${
              messageType === "error" ? styles.error : styles.success
            }`}
            role="status"
          >
            {messageType === "success" ? <Check size={17} /> : <X size={17} />}
            {message}
          </div>
        ) : null}

        <div className={styles.workspace}>
          <form className={styles.editor} onSubmit={saveTemplate}>
            <div className={styles.sectionHeading}>
              <span className={styles.step}>01</span>
              <div>
                <h2>{editingId ? "Edit template" : "Create a template"}</h2>
                <p>Template names should identify the gateway and environment.</p>
              </div>
            </div>

            <label className={styles.fieldLabel} htmlFor="template-name">
              Template name
            </label>
            <input
              id="template-name"
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="RockyPayz production"
              autoComplete="off"
              required
            />

            <div className={styles.divider} />

            <div className={styles.sectionHeading}>
              <span className={styles.step}>02</span>
              <div>
                <h2>Common fields</h2>
                <p>Select only the values required by this gateway.</p>
              </div>
            </div>

            <div className={styles.checkGrid}>
              {commonFields.map((field) => {
                const checked =
                  selected[field.key as keyof typeof selected];
                return (
                  <label
                    className={`${styles.checkOption} ${
                      checked ? styles.checkOptionActive : ""
                    }`}
                    key={field.key}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [field.key]: event.target.checked,
                        }))
                      }
                    />
                    <span className={styles.checkbox}>
                      {checked ? <Check size={14} /> : null}
                    </span>
                    <span>{field.label}</span>
                  </label>
                );
              })}
            </div>

            <div className={styles.dynamicFields}>
              {commonFields
                .filter(
                  (field) => selected[field.key as keyof typeof selected]
                )
                .map((field) =>
                  field.type === "mode" ? (
                    <ModeField
                      key={field.key}
                      value={values.mode}
                      onChange={(value) =>
                        setValues((current) => ({ ...current, mode: value }))
                      }
                    />
                  ) : (
                    <CredentialInput
                      key={field.key}
                      fieldKey={field.key}
                      label={field.label}
                      value={values[field.key as keyof typeof values]}
                      stored={Boolean(editingId)}
                      visible={Boolean(visibleSecrets[field.key])}
                      onToggleVisibility={() =>
                        setVisibleSecrets((current) => ({
                          ...current,
                          [field.key]: !current[field.key],
                        }))
                      }
                      onChange={(value) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: value,
                        }))
                      }
                    />
                  )
                )}
            </div>

            <div className={styles.divider} />

            <div className={styles.sectionHeading}>
              <span className={styles.step}>03</span>
              <div>
                <h2>Gateway-specific fields</h2>
                <p>Add routes, tokens, base URLs, or any provider requirement.</p>
              </div>
            </div>

            <div className={styles.customFields}>
              {customFields.map((field, index) => (
                <div className={styles.customRow} key={field.id}>
                  <div className={styles.customRowHeader}>
                    <span>Custom field {index + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomFields((current) =>
                          current.filter((item) => item.id !== field.id)
                        )
                      }
                      aria-label={`Remove custom field ${index + 1}`}
                      title="Remove field"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className={styles.customGrid}>
                    <label>
                      <span>Field label</span>
                      <input
                        className={styles.input}
                        value={field.label}
                        onChange={(event) =>
                          updateCustomField(
                            field.id,
                            "label",
                            event.target.value
                          )
                        }
                        placeholder="Base URL"
                        required
                      />
                    </label>
                    <label>
                      <span>Field key</span>
                      <input
                        className={`${styles.input} ${styles.mono}`}
                        value={field.key}
                        onChange={(event) =>
                          updateCustomField(
                            field.id,
                            "key",
                            event.target.value
                          )
                        }
                        placeholder="baseUrl"
                        pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
                        required
                      />
                    </label>
                    <label>
                      <span>Input type</span>
                      <select
                        className={styles.input}
                        value={field.type}
                        onChange={(event) =>
                          updateCustomField(
                            field.id,
                            "type",
                            event.target.value
                          )
                        }
                      >
                        <option value="secret">Secret</option>
                        <option value="text">Text</option>
                      </select>
                    </label>
                    <label>
                      <span>Value</span>
                      <input
                        className={styles.input}
                        type={field.type === "secret" ? "password" : "text"}
                        value={field.value}
                        onChange={(event) =>
                          updateCustomField(
                            field.id,
                            "value",
                            event.target.value
                          )
                        }
                        placeholder={
                          field.hasStoredValue
                            ? "Stored value - leave blank to keep"
                            : "Enter value"
                        }
                        required={!field.hasStoredValue}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className={styles.addButton}
              onClick={addCustomField}
            >
              <Plus size={17} />
              Add custom field
            </button>

            <div className={styles.formActions}>
              {editingId ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={resetForm}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.saveButton}
                disabled={saving}
              >
                <FileKey size={18} />
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update template"
                    : "Save template"}
              </button>
            </div>
          </form>

          <aside className={styles.registry}>
            <div className={styles.registryHeader}>
              <div>
                <p className={styles.eyebrow}>Template registry</p>
                <h2>{templates.length} saved</h2>
              </div>
              <KeyRound size={22} />
            </div>

            {loading ? (
              <div className={styles.skeletonList} aria-label="Loading templates">
                <span />
                <span />
                <span />
              </div>
            ) : templates.length ? (
              <div className={styles.templateList}>
                {templates.map((template) => (
                  <article className={styles.templateItem} key={template._id}>
                    <div className={styles.templateTopline}>
                      <div>
                        <h3>{template.name}</h3>
                        <p>
                          {template.fieldCount} fields · {template.usageCount} MID
                          {template.usageCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span
                        className={
                          template.fields.find(
                            (field) => field.key === "mode"
                          )?.value === "sandbox"
                            ? styles.sandboxBadge
                            : styles.productionBadge
                        }
                      >
                        {template.fields.find((field) => field.key === "mode")
                          ?.value || "configured"}
                      </span>
                    </div>
                    <div className={styles.fieldTags}>
                      {template.fields.map((field) => (
                        <span key={field.key}>
                          {field.label}
                          {field.hasValue ? <Check size={12} /> : null}
                        </span>
                      ))}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        onClick={() => editTemplate(template)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.deleteAction}
                        onClick={() => deleteTemplate(template)}
                        disabled={template.usageCount > 0}
                        title={
                          template.usageCount
                            ? "Detach this template from its MID pools first"
                            : "Delete template"
                        }
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <FileKey size={28} />
                <h3>No credential templates</h3>
                <p>Create the first template, then attach it to a MID pool.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function CredentialInput({
  fieldKey,
  label,
  value,
  stored,
  visible,
  onToggleVisibility,
  onChange,
}: {
  fieldKey: string;
  label: string;
  value: string;
  stored: boolean;
  visible: boolean;
  onToggleVisibility: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.credentialField}>
      <span>{label}</span>
      <span className={styles.inputWithAction}>
        <input
          className={styles.input}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={stored ? "Stored value - leave blank to keep" : `Enter ${label.toLowerCase()}`}
          required={!stored}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={`${visible ? "Hide" : "Show"} ${label}`}
          title={`${visible ? "Hide" : "Show"} ${label}`}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      <small className={styles.keyHint}>{fieldKey}</small>
    </label>
  );
}

function ModeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className={styles.modeField}>
      <legend>Mode</legend>
      <div>
        {["sandbox", "production"].map((mode) => (
          <label
            key={mode}
            className={value === mode ? styles.modeActive : ""}
          >
            <input
              type="radio"
              name="gateway-mode"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
            />
            {mode}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

