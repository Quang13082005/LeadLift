"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { normalizeDomain } from "@/lib/domain-normalizer";
import { createBusinessAction } from "@/app/actions/business";
import { useToast } from "@/components/ui/toast";
import type { BusinessItem, CreateBusinessInput } from "@/types/business";

interface CreateBusinessDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newBusiness: BusinessItem) => void;
}

export function CreateBusinessDialog({ open, onClose, onSuccess }: CreateBusinessDialogProps) {
  const notify = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateBusinessInput>({
    name: "",
    websiteUrl: "",
    industry: "Cho thuê xe máy",
    category: "",
    city: "Đà Nẵng",
    district: "Hải Châu",
    address: "",
    phone: "",
    email: "",
    dataSource: "Thủ công",
    notes: "",
  });

  const normalizedPreview = normalizeDomain(formData.websiteUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      setError("Tên doanh nghiệp phải có ít nhất 2 ký tự.");
      return;
    }

    if (!formData.websiteUrl.trim() || !normalizedPreview) {
      setError("Vui lòng nhập địa chỉ website hợp lệ.");
      return;
    }

    setLoading(true);
    try {
      const res = await createBusinessAction(formData);
      if (res.success && res.data) {
        notify(`✓ Đã thêm doanh nghiệp "${formData.name}" thành công.`);
        onSuccess(res.data as BusinessItem);
        onClose();
        // Reset form
        setFormData({
          name: "",
          websiteUrl: "",
          industry: "Cho thuê xe máy",
          category: "",
          city: "Đà Nẵng",
          district: "Hải Châu",
          address: "",
          phone: "",
          email: "",
          dataSource: "Thủ công",
          notes: "",
        });
      } else {
        setError(res.error || "Không thể tạo hồ sơ doanh nghiệp.");
      }
    } catch {
      setError("Đã xảy ra lỗi không mong muốn khi gửi dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="＋ Thêm doanh nghiệp mới"
      description="Nhập thông tin doanh nghiệp để theo dõi, quản lý và chuẩn bị cho Website Audit."
    >
      <form onSubmit={handleSubmit} className="biz-form">
        {error && (
          <div className="alert-box alert-red" role="alert">
            <span className="alert-icon">⚠️</span>
            <div>{error}</div>
          </div>
        )}

        <div className="form-grid">
          <div className="form-field full">
            <label htmlFor="biz-name" className="form-label">
              Tên doanh nghiệp <span className="req">*</span>
            </label>
            <input
              id="biz-name"
              type="text"
              required
              placeholder="VD: Cửa hàng Cho thuê xe máy Gia Huy"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-field full">
            <label htmlFor="biz-url" className="form-label">
              Địa chỉ Website / Domain <span className="req">*</span>
            </label>
            <input
              id="biz-url"
              type="text"
              required
              placeholder="VD: https://thuexemaydanang.vn hoặc thuexemaydanang.vn"
              value={formData.websiteUrl}
              onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
              className="form-input"
            />
            {normalizedPreview ? (
              <p className="field-hint green-hint">
                ✓ Tên miền chuẩn hóa: <strong>{normalizedPreview}</strong>
              </p>
            ) : (
              <p className="field-hint">Hệ thống sẽ tự động trích xuất tên miền chuẩn để kiểm tra chống trùng lặp.</p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="biz-industry" className="form-label">
              Ngành nghề <span className="req">*</span>
            </label>
            <select
              id="biz-industry"
              value={formData.industry}
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
            <label htmlFor="biz-city" className="form-label">
              Khu vực / Tỉnh thành
            </label>
            <select
              id="biz-city"
              value={formData.city}
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
            <label htmlFor="biz-district" className="form-label">
              Quận / Huyện
            </label>
            <select
              id="biz-district"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              className="form-select"
            >
              <option value="Hải Châu">Hải Châu</option>
              <option value="Sơn Trà">Sơn Trà</option>
              <option value="Ngũ Hành Sơn">Ngũ Hành Sơn</option>
              <option value="Thanh Khê">Thanh Khê</option>
              <option value="Liên Chiểu">Liên Chiểu</option>
              <option value="Cẩm Lệ">Cẩm Lệ</option>
              <option value="Hòa Vang">Hòa Vang</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="biz-phone" className="form-label">
              Số điện thoại
            </label>
            <input
              id="biz-phone"
              type="text"
              placeholder="VD: 0905 123 456"
              value={formData.phone || ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="biz-email" className="form-label">
              Email liên hệ
            </label>
            <input
              id="biz-email"
              type="email"
              placeholder="VD: contact@thuexemaydanang.vn"
              value={formData.email || ""}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="biz-source" className="form-label">
              Nguồn dữ liệu
            </label>
            <input
              id="biz-source"
              type="text"
              placeholder="VD: Google Maps, Thủ công..."
              value={formData.dataSource || ""}
              onChange={(e) => setFormData({ ...formData, dataSource: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-field full">
            <label htmlFor="biz-notes" className="form-label">
              Ghi chú thêm
            </label>
            <textarea
              id="biz-notes"
              rows={2}
              placeholder="Ghi chú về cơ sở, địa chỉ chi tiết hoặc điểm nhận diện..."
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
            {loading ? "Đang lưu..." : "✓ Thêm doanh nghiệp"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
