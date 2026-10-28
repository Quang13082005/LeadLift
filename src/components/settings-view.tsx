import { Badge } from "@/components/ui/primitives";
import { FeatureBanner, PageHeading } from "@/components/page-foundation";

const integrations = ["Email", "Zalo Official Account", "Facebook Messenger", "Điện thoại", "Google PageSpeed Insights", "Chrome UX Report"];

export function SettingsView() {
  return <>
    <PageHeading title="Cài đặt & Tích hợp" description="Theo dõi kết nối và quy trình chuẩn bị cho các dịch vụ của LeadLift." />
    <FeatureBanner kicker="KHÔNG GIAN LÀM VIỆC" title="Kiểm soát kết nối và quyền gửi" description="Chỉ bật kênh sau khi thiết lập xác thực, thông tin kết nối và quyền duyệt phù hợp." />
    <div className="dual settings-grid"><section className="panel"><header className="panel-heading"><h2>Kênh tích hợp</h2><p className="hint">Trạng thái phản ánh kết nối đang có trong ứng dụng.</p></header><div className="panel-body integration-list">{integrations.map((name) => <div className="integration-row" key={name}><div><b>{name}</b><p className="hint">Chưa cấu hình kết nối trong ứng dụng.</p></div><Badge>Chưa kết nối</Badge></div>)}</div></section><section className="panel"><header className="panel-heading"><h2>Quy trình & an toàn</h2><p className="hint">Các nguyên tắc hiện hành trước khi mở nghiệp vụ.</p></header><div className="panel-body settings-rules"><div className="kv"><span>Xác thực người dùng</span><b>Chưa tích hợp · production khóa nghiệp vụ</b></div><div className="kv"><span>Website Audit</span><b>Development only · quét từng URL</b></div><div className="kv"><span>Lưu lịch sử Audit</span><b>Chưa triển khai</b></div><div className="kv"><span>Gửi đề xuất</span><b>Chưa kết nối · chưa gửi tin</b></div><div className="kv"><span>Pipeline CRM</span><b>Chưa kết nối · không có hội thoại thật</b></div><div className="kv"><span>PageSpeed / CrUX</span><b>Chưa gọi API · chưa cấu hình khóa</b></div><div className="alert-box alert-amber">Trước production cần hoàn thành Auth, phân quyền, lưu trữ dữ liệu và kiểm thử quyền truy cập.</div></div></section></div>
  </>;
}
