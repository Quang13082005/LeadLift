"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { normalizeDomain } from "@/lib/domain-normalizer";
import { updateBusinessAction } from "@/app/actions/business";
import { useToast } from "@/components/ui/toast";
import {
  LEAD_STATUS_LABELS,
  type BusinessItem,
  type LeadStatus,
  type UpdateBusinessInput,
} from "@/types/business";

interface EditBusinessDialogProps {
  business: BusinessItem | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: BusinessItem) => void;
}

function EditBusinessForm({
  business,
  onClose,
  onSuccess,
}: {
  business: BusinessItem;
  onClose: () => void;
  onSuccess: (updated: BusinessItem) => void;
}) {
  const notify = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<UpdateBusinessInput>({
    id: business.id,
    name: business.name,
    websiteUrl: business.websiteUrl,
    industry: business.industry,
    category: business.category || "",
    city: business.city,
    district: business.district || "",
    address: business.address || "",
    phone: business.phone || "",
    email: business.email || "",
    leadStatus: business.leadStatus,
    notes: business.notes || "",
  });

  const normalizedPreview = normalizeDomain(formData.websiteUrl || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name?.trim() || formData.name.trim().length < 2) {
      setError("Tên doanh nghiệp phải có ít nhất 2 ký tự.");
      return;
    }

    if (!formData.websiteUrl?.trim() || !normalizedPreview) {
      setError("Vui lòng nhập địa chỉ website hợp lệ.");
      return;
    }

    setLoading(true);
    try {
      const res = await updateBusinessAction(formData);
      if (res.success && res.data) {
        notify(`✓ Đã cập nhật thông tin "${formData.name}" thành công.`);
        onSuccess(res.data as BusinessItem);
        onClose();
      } else {
        setError(res.error || "Không thể cập nhật hồ sơ doanh nghiệp.");
      }
    } catch {
      setError("Đã xảy ra lỗi không mong muốn khi cập nhật dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="biz-form">
      {error && (
        <div className="alert-box alert-red" role="alert">
          <span className="alert-icon">⚠️</span>
          <div>{error}</div>
        </div>
      )}

      <div className="form-grid">
        <div className="form-field full">
          <label htmlFor="edit-name" className="form-label">
            Tên doanh nghiệp <span className="req">*</span>
          </label>
          <input
            id="edit-name"
            type="text"
            required
            value={formData.name || ""}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-field full">
          <label htmlFor="edit-url" className="form-label">
            Địa chỉ Website / Domain <span className="req">*</span>
          </label>
          <input
            id="edit-url"
            type="text"
            required
            value={formData.websiteUrl || ""}
            onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
            className="form-input"
          />
          {normalizedPreview && (
            <p className="field-hint green-hint">
              ✓ Tên miền chuẩn hóa: <strong>{normalizedPreview}</strong>
            </p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="edit-status" className="form-label">
            Trạng thái hồ sơ
          </label>
          <select
            id="edit-status"
            value={formData.leadStatus || "NEW_DISCOVERED"}
            onChange={(e) => setFormData({ ...formData, leadStatus: e.target.value as LeadStatus })}
            className="form-select"
          >
            {Object.entries(LEAD_STATUS_LABELS).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="edit-industry" className="form-label">
            Ngành nghề <span className="req">*</span>
          </label>
          <select
            id="edit-industry"
            value={formData.industry || "Cho thuê xe máy"}
            onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
            className="form-select"
          >
            <option value="Cho thuê xe máy">Cho thuê xe máy</option>
            <option value="Khách sạn">Khách sạn</option>
            <option value="Nhà hàng">Nhà hàng</option>
            <option value="Quán cà phê">Quán cà phê</option>
            <option value="Spa">Spa & Chăm sóc sức khỏe</option>
            <option value="Du lịch & Tour">Du lịch & Tour</option>
            <option value="Dịch vụ địa phương">Dịch vụ địa phương khác</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="edit-city" className="form-label">
            Khu vực / Tỉnh thành
          </label>
          <select
            id="edit-city"
            value={formData.city || "Đà Nẵng"}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            className="form-select"
          >
            <option value="Đà Nẵng">Đà Nẵng</option>
            <option value="Hội An">Hội An (Quảng Nam)</option>
            <option value="Huế">Huế</option>
            <option value="Khác">Khác</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="edit-district" className="form-label">
            Quận / Huyện
          </label>
          <input
            id="edit-district"
            type="text"
            placeholder="VD: Hải Châu, Sơn Trà..."
            value={formData.district || ""}
            onChange={(e) => setFormData({ ...formData, district: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label htmlFor="edit-phone" className="form-label">
            Số điện thoại
          </label>
          <input
            id="edit-phone"
            type="text"
            placeholder="VD: 0905 123 456"
            value={formData.phone || ""}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label htmlFor="edit-email" className="form-label">
            Email liên hệ
          </label>
          <input
            id="edit-email"
            type="email"
            placeholder="VD: contact@thuexemaydanang.vn"
            value={formData.email || ""}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-field full">
          <label htmlFor="edit-notes" className="form-label">
            Ghi chú thêm
          </label>
          <textarea
            id="edit-notes"
            rows={2}
            value={formData.notes || ""}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="form-textarea"
          />
        </div>
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Hủy bỏ
        </Button>
        <Button variant="primary" type="submit" disabled={loading}>
          {loading ? "Đang lưu..." : "✓ Cập nhật hồ sơ"}
        </Button>
      </div>
    </form>
  );
}

export function EditBusinessDialog({ business, open, onClose, onSuccess }: EditBusinessDialogProps) {
  if (!business) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="✏ Chỉnh sửa hồ sơ doanh nghiệp"
      description={`Cập nhật thông tin chi tiết cho mã hồ sơ: ${business.id}`}
    >
      <EditBusinessForm
        key={business.id}
        business={business}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </Dialog>
  );
}
