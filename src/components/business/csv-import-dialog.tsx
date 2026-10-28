"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { validateCsvAction, importCsvAction } from "@/app/actions/business";
import { useToast } from "@/components/ui/toast";
import type { CsvValidationResult } from "@/types/business";

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (importedCount: number) => void;
}

export function CsvImportDialog({ open, onClose, onSuccess }: CsvImportDialogProps) {
  const notify = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationId = useRef(0);
  useEffect(() => () => { validationId.current++; }, []);

  const [fileName, setFileName] = useState<string>("");
  const [validating, setValidating] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<CsvValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    validationId.current++;
    setFileName("");
    setValidating(false);
    setImporting(false);
    setValidationResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (importing) return;
    const request = ++validationId.current;
    setValidationResult(null);
    setValidating(false);
    setError(null);
    setFileName("");
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Vui lòng chọn tệp có định dạng .csv");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(`Kích thước tệp (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn 2MB.`);
      return;
    }

    setError(null);
    setFileName(file.name);

    setValidating(true);
    try {
      const content = await file.text();
      if (request !== validationId.current) return;
      const res = await validateCsvAction(content);
      if (request !== validationId.current) return;
      if (res.success && res.result) {
        setValidationResult(res.result);
      } else {
        setError(res.error || "Không thể xác thực tệp CSV.");
      }
    } catch {
      if (request === validationId.current) setError("Không thể đọc hoặc xác thực tệp CSV.");
    } finally {
      if (request === validationId.current) setValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (importing || validating || error || !validationResult || validationResult.validRows.length === 0) return;

    setImporting(true);
    setError(null);
    try {
      const res = await importCsvAction(validationResult.validRows);
      if (res.success) {
        const count = res.importedCount || 0;
        notify(`✓ Đã nhập ${count} doanh nghiệp; bỏ qua ${res.skippedCount || 0} dòng trùng. Không ghi đè hồ sơ.`);
        onSuccess(count);
        onClose();
        resetState();
      } else {
        setError(res.error || "Không thể hoàn thành thao tác nhập dữ liệu.");
      }
    } catch {
      setError("Đã xảy ra lỗi kết nối khi lưu dữ liệu.");
    } finally {
      setImporting(false);
    }
  };

  const sampleCsvTemplate = `Tên doanh nghiệp,Website,Ngành nghề,Khu vực,Số điện thoại,Email
Doanh nghiệp mẫu - thay trước khi nhập,https://doanh-nghiep.example,Dịch vụ địa phương,Đà Nẵng,,`;

  const downloadSampleTemplate = () => {
    const blob = new Blob(["\uFEFF" + sampleCsvTemplate], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leadlift_doanh_nghiep_mau.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (importing) return;
        onClose();
        resetState();
      }}
      title="⇧ Nhập danh sách doanh nghiệp từ CSV"
      description="Tải lên tệp CSV để nhập hàng loạt hồ sơ doanh nghiệp. Hệ thống sẽ tự động xác thực và lọc chống trùng tên miền."
      className="dialog-wide"
    >
      <div className="csv-container">
        {error && (
          <div className="alert-box alert-red" role="alert">
            <span className="alert-icon">⚠️</span>
            <div>{error}</div>
          </div>
        )}

        {/* Step 1: Upload Dropzone & Template */}
        <div className="csv-upload-box">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            id="csv-file-input"
            className="sr-only"
            disabled={importing}
          />
          <label htmlFor="csv-file-input" className="csv-dropzone">
            <span className="csv-upload-icon" aria-hidden="true">
              📄
            </span>
            <div className="csv-upload-text">
              <strong>{fileName ? fileName : "Bấm để chọn tệp CSV từ máy tính"}</strong>
              <p>Hỗ trợ tệp .CSV chuẩn UTF-8, tối đa 2MB và không quá 200 dòng.</p>
            </div>
            <Button variant="secondary" small disabled={importing} onClick={(event) => { event.preventDefault(); fileInputRef.current?.click(); }}>
              {fileName ? "Chọn tệp khác" : "Chọn tệp CSV"}
            </Button>
          </label>

          <div className="csv-template-bar">
            <span>Chưa có mẫu dữ liệu chuẩn?</span>
            <button type="button" onClick={downloadSampleTemplate} className="template-link">
              ⬇ Tải tệp CSV mẫu (.csv)
            </button>
          </div>
        </div>

        {/* Step 2: Live Validation Results */}
        {validating && (
          <div className="loading-state">
            <span className="spinner" aria-hidden="true" />
            Đang phân tích cú pháp và kiểm tra tên miền trong cơ sở dữ liệu...
          </div>
        )}

        {validationResult && !validating && (
          <div className="validation-section">
            <div className="summary-chips">
              <span className="chip">Tổng cộng: {validationResult.totalRows} dòng</span>
              <span className="chip green">✓ Hợp lệ: {validationResult.validCount} dòng</span>
              {validationResult.invalidCount > 0 && (
                <span className="chip bad">✕ Không hợp lệ / Trùng lặp: {validationResult.invalidCount} dòng</span>
              )}
            </div>

            {/* Error List */}
            {validationResult.errors.length > 0 && (
              <div className="csv-error-box">
                <h4 className="error-title">Danh sách các dòng gặp lỗi (sẽ tự động bỏ qua khi nhập):</h4>
                <div className="error-list">
                  {validationResult.errors.map((err, idx) => (
                    <div key={idx} className="error-item">
                      <span className="err-badge">Dòng {err.rowNumber}</span>
                      <span className="err-msg">{err.message}</span>
                      {err.rawValue && <code className="err-raw">Giá trị: {err.rawValue}</code>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Valid Rows Preview Table */}
            {validationResult.validRows.length > 0 ? (
              <div className="preview-wrap">
                <h4 className="preview-title">Xem trước các doanh nghiệp sẵn sàng lưu ({validationResult.validCount}):</h4>
                <div className="table-responsive">
                  <table className="table mini-table">
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Tên doanh nghiệp</th>
                        <th>Website</th>
                        <th>Domain chuẩn hóa</th>
                        <th>Ngành nghề</th>
                        <th>Khu vực</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.validRows.slice(0, 10).map((row) => (
                        <tr key={row.rowNumber}>
                          <td>#{row.rowNumber}</td>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>{row.websiteUrl}</td>
                          <td>
                            <code className="domain-pill">{row.normalizedDomain}</code>
                          </td>
                          <td>{row.industry}</td>
                          <td>{row.city}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validationResult.validRows.length > 10 && (
                    <p className="preview-more-hint">
                      ...và còn {validationResult.validRows.length - 10} dòng hợp lệ khác.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="alert-box alert-amber">
                Không tìm thấy dòng nào hợp lệ để nhập. Vui lòng kiểm tra lại cấu trúc tệp CSV.
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <Button variant="secondary" onClick={() => { onClose(); resetState(); }} disabled={importing}>
            Đóng
          </Button>
          <Button
            variant="primary"
            disabled={!!error || !validationResult || validationResult.validCount === 0 || importing || validating}
            onClick={handleConfirmImport}
          >
            {importing
              ? "Đang lưu vào hệ thống..."
              : `✓ Xác nhận nhập ${validationResult?.validCount || 0} doanh nghiệp`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
