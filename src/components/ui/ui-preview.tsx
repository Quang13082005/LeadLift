"use client";

import { useState } from "react";
import { PageHeading } from "../page-foundation";
import { Badge, Button, Card, EmptyState, LoadingState, Panel, StatCard } from "./primitives";
import { Dialog } from "./dialog";
import { useToast } from "./toast";

/** Available only through the server-guarded /dev/ui development route. */
export function UiPreview() {
  const [open, setOpen] = useState(false);
  const notify = useToast();
  return <>
    <PageHeading title="Kiểm thử giao diện" description="Development only · Kiểm tra component, không phải chức năng nghiệp vụ." />
    <Panel title="Button, dialog & toast"><div className="panel-body actions"><Button variant="primary" onClick={() => setOpen(true)}>Mở dialog</Button><Button onClick={() => notify("Thông báo kiểm thử giao diện. Không có dữ liệu được lưu.")}>Hiện toast</Button><Button variant="quiet" onClick={() => notify("Đã thử nút phụ.")}>Nút phụ</Button><Button variant="danger" onClick={() => notify("Chỉ kiểm thử kiểu nút, không xóa dữ liệu.")}>Nút cảnh báo</Button><Button disabled>Chưa khả dụng</Button></div></Panel>
    <div className="preview-group actions"><Badge>Trung tính</Badge><Badge tone="green">Thành công</Badge><Badge tone="amber">Cần chú ý</Badge><Badge tone="red">Lỗi</Badge><Badge tone="blue">Thông tin</Badge></div>
    <div className="stats"><StatCard label="Số liệu chưa kết nối" /></div>
    <Card><EmptyState title="Trạng thái trống" description="Mô tả được gắn nhãn rõ ràng." /><LoadingState label="Trạng thái tải để kiểm thử" /></Card>
    <Dialog open={open} onClose={() => setOpen(false)} title="Hộp thoại kiểm thử" description="Dùng Tab để di chuyển, Escape hoặc nút Đóng để trở lại nút mở."><p>Đây là UI preview. Không đọc hoặc ghi dữ liệu nghiệp vụ.</p><div className="actions"><Button onClick={() => setOpen(false)}>Quay lại</Button><Button variant="primary" onClick={() => { setOpen(false); notify("Đã đóng hộp thoại kiểm thử."); }}>Đóng và hiện toast</Button></div></Dialog>
  </>;
}
