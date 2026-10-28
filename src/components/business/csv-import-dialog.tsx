"use client";

import { useState, useRef } from "react";
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

  const [fileName, setFileName] = useState<string>("");
  const [validating, setValidating] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<CsvValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setFileName("");
    setValidating(false);
    setImporting(false);
    setValidationResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setError("Vui lòng chọn tệp có định dạng .csv");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(`Kích thước tệp (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn 2MB.`);
      return;
    }

    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      await triggerValidation(content);
    };
    reader.onerror = () => {
      setError("Không thể đọc nội dung tệp tin đã chọn.");
    };
    reader.readAsText(file, "UTF-8");
  };

  const triggerValidation = async (content: string) => {
    setValidating(true);
    setError(null);
    try {
      const res = await validateCsvAction(content);
      if (res.success && res.result) {
        setValidationResult(res.result);
      } else {
        setError(res.error || "Không thể xác thực tệp CSV.");
      }
    } catch {
      setError("Đã xảy ra lỗi khi xác thực tệp CSV.");
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!validationResult || validationResult.validRows.length === 0) return;

    setImporting(true);
    setError(null);
    try {
      const res = await importCsvAction(validationResult.validRows);
      if (res.success) {
        const count = res.importedCount || 0;
        notify(`✓ Đã nhập thành công ${count} doanh nghiệp vào hệ thống.`);
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
Cửa hàng Thuê xe máy Sơn Trà,https://thuexemaysontra.vn,Cho thuê xe máy,Đà Nẵng,0905111222,info@thuexemaysontra.vn
Khách sạn Biển Xanh Đà Nẵng,khachsangoldenbeach.com,Khách sạn,Sơn Trà,02363888999,booking@goldendn.com
Nhà hàng Hải sản Mỹ Hạnh,myhanhseafood.vn,Nhà hàng,Ngũ Hành Sơn,0912333444,contact@myhanh.vn`;

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
          />
          <label htmlFor="csv-file-input" className="csv-dropzone">
            <span className="csv-upload-icon" aria-hidden="true">
              📄
            </span>
            <div className="csv-upload-text">
              <strong>{fileName ? fileName : "Bấm để chọn tệp CSV từ máy tính"}</strong>
              <p>Hỗ trợ tệp .CSV chuẩn UTF-8, tối đa 2MB và không quá 200 dòng.</p>
            </div>
            <Button variant="secondary" small onClick={() => fileInputRef.current?.click()}>
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
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Đóng
          </Button>
          <Button
            variant="primary"
            disabled={!validationResult || validationResult.validCount === 0 || importing || validating}
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
