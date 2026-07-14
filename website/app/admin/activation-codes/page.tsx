"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/LanguageProvider";

interface ActivationCode {
  _id: string;
  id: string;
  code: string;
  deviceId: string;
  phoneNumber: string;
  status: "unused" | "used" | "reset";
  usedAt: string | null;
  resetAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const translations = {
  en: {
    title: "Device Activation Codes",
    subtitle: "Generate and manage mobile app activation codes",
    generateSection: "Generate New Activation Code",
    notesPlaceholder: "Notes (optional)",
    generateBtn: "Generate Code",
    generating: "Generating...",
    filterLabel: "Filter by Status:",
    all: "All",
    unused: "Unused",
    used: "Used",
    reset: "Reset",
    loading: "Loading...",
    noCodesFound: "No activation codes found",
    codeColumn: "Code",
    statusColumn: "Status",
    deviceColumn: "Device ID",
    phoneColumn: "Phone",
    notesColumn: "Notes",
    createdColumn: "Created",
    actionsColumn: "Actions",
    resetAction: "Reset",
    deleteAction: "Delete",
    copied: "Copied",
    unusedCount: "Unused",
    usedCount: "Used",
    resetCount: "Reset",
    resetConfirm: "Reset this activation code? The device will need a new code to activate.",
    deleteConfirm: "Delete this activation code? This action cannot be undone.",
  },
  zh: {
    title: "设备激活码",
    subtitle: "生成和管理移动应用程序激活码",
    generateSection: "生成新激活码",
    notesPlaceholder: "备注（可选）",
    generateBtn: "生成激活码",
    generating: "生成中...",
    filterLabel: "状态筛选：",
    all: "全部",
    unused: "未使用",
    used: "已使用",
    reset: "已重置",
    loading: "加载中...",
    noCodesFound: "没有找到激活码",
    codeColumn: "激活码",
    statusColumn: "状态",
    deviceColumn: "设备ID",
    phoneColumn: "电话号码",
    notesColumn: "备注",
    createdColumn: "创建时间",
    actionsColumn: "操作",
    resetAction: "重置",
    deleteAction: "删除",
    copied: "已复制",
    unusedCount: "未使用",
    usedCount: "已使用",
    resetCount: "已重置",
    resetConfirm: "重置此激活码？设备将需要新代码才能激活。",
    deleteConfirm: "删除此激活码？此操作无法撤消。",
  },
};

export default function ActivationCodesPage() {
  const { language } = useLanguage();
  const t = translations[language];
  
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchCodes = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      
      const response = await fetch(`/api/admin/activation-codes?${params}`);
      const data = await response.json();

      if (data.success) {
        setCodes(data.codes || []);
      }
    } catch (error) {
      console.error("Failed to fetch activation codes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, [statusFilter]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/admin/activation-codes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();

      if (data.success) {
        setNotes("");
        fetchCodes();
      } else {
        alert("Failed to generate code: " + data.error);
      }
    } catch (error) {
      console.error("Error generating code:", error);
      alert("Failed to generate activation code");
    } finally {
      setGenerating(false);
    }
  };

  const resetCode = async (codeId: string) => {
    if (!confirm(t.resetConfirm)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/activation-codes/${codeId}/reset`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        fetchCodes();
      } else {
        alert("Failed to reset code: " + data.error);
      }
    } catch (error) {
      console.error("Error resetting code:", error);
      alert("Failed to reset activation code");
    }
  };

  const deleteCode = async (codeId: string) => {
    if (!confirm(t.deleteConfirm)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/activation-codes/${codeId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        fetchCodes();
      } else {
        alert("Failed to delete code: " + data.error);
      }
    } catch (error) {
      console.error("Error deleting code:", error);
      alert("Failed to delete activation code");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(`${t.copied}: ${text}`);
  };

  const getStatusBadge = (status: string) => {
    const statusText = {
      unused: t.unused,
      used: t.used,
      reset: t.reset,
    }[status] || status;

    const styles = {
      unused: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      used: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      reset: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || ""}`}>
        {statusText.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t.title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {t.subtitle}
        </p>
      </div>

      {/* Generate New Code */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t.generateSection}
        </h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button
            onClick={generateCode}
            disabled={generating}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? t.generating : t.generateBtn}
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t.filterLabel}
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">{t.all}</option>
            <option value="unused">{t.unused}</option>
            <option value="used">{t.used}</option>
            <option value="reset">{t.reset}</option>
          </select>
        </div>
      </div>

      {/* Codes List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {t.loading}
          </div>
        ) : codes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {t.noCodesFound}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.codeColumn}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.statusColumn}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.deviceColumn}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.phoneColumn}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.notesColumn}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.createdColumn}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t.actionsColumn}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {codes.map((code) => (
                  <tr key={code.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => copyToClipboard(code.code)}
                        className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        {code.code}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(code.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {code.deviceId || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {code.phoneNumber || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {code.notes || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {new Date(code.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex gap-2 justify-end">
                        {code.status === "used" && (
                          <button
                            onClick={() => resetCode(code.id)}
                            className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300"
                          >
                            {t.resetAction}
                          </button>
                        )}
                        <button
                          onClick={() => deleteCode(code.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          {t.deleteAction}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <div className="text-sm text-green-600 dark:text-green-400">{t.unusedCount}</div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
            {codes.filter((c) => c.status === "unused").length}
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <div className="text-sm text-blue-600 dark:text-blue-400">{t.usedCount}</div>
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
            {codes.filter((c) => c.status === "used").length}
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
          <div className="text-sm text-red-600 dark:text-red-400">{t.resetCount}</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">
            {codes.filter((c) => c.status === "reset").length}
          </div>
        </div>
      </div>
    </div>
  );
}
