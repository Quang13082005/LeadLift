"use client";

import { useState } from "react";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";

export interface PipelineOpportunity {
  businessName: string;
  domain: string;
  score: number;
  owner: string;
}

const transcript = [
  { role: "Bot", time: "09:12", text: "Chào anh/chị, tôi có thể kết nối anh/chị với người tư vấn website." },
  { role: "Khách hàng", time: "09:14", text: "Bên mình đang muốn cải thiện lượng khách đặt tour qua website." },
  { role: "Bot", time: "09:15", text: "Tôi đã ghi nhận nhu cầu. Chuyên viên sẽ tiếp tục trao đổi cụ thể." },
];

export function PipelineView({ opportunity }: { opportunity?: PipelineOpportunity }) {
  const [open, setOpen] = useState(false);
  const [takenOver, setTakenOver] = useState(false);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTranscript = async () => {
    try {
      const lines = transcript.map((line) => `${line.time} · ${line.role}: ${line.text}`);
      if (note) lines.push("09:16 · Ghi chú nội bộ: " + note);
      if (reply && takenOver) lines.push("09:18 · Chuyên viên: " + reply);
      const contents = lines.join("\n");
      try {
        await navigator.clipboard.writeText(contents);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = contents;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        const dialog = document.getElementById("conversation-handoff");
        (dialog || document.body).appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      setCopied(true);
    } catch { setCopied(false); }
  };

  return <>
    <div className="split">
      <section className="panel">
        <header className="panel-heading"><h2>Pipeline cơ hội hợp tác</h2><p className="hint">Theo dõi trạng thái doanh nghiệp và người phụ trách.</p></header>
        {opportunity ? <div className="tableWrap"><table className="table"><thead><tr><th>Doanh nghiệp</th><th>Trạng thái</th><th>Người phụ trách</th><th>Điểm tham khảo</th></tr></thead><tbody><tr><td><b>{opportunity.businessName}</b><div className="sub">{opportunity.domain}</div></td><td><Badge tone="amber">Cần bàn giao</Badge></td><td>{opportunity.owner}</td><td>{opportunity.score}/100</td></tr></tbody></table></div> : <EmptyState icon="✉" title="Chưa có cơ hội trong Pipeline" description="Hồ sơ mới sẽ xuất hiện khi được ghi nhận có phản hồi quan tâm. Pipeline CRM chưa được kết nối." />}
      </section>
      <section className="panel">
        <header className="panel-heading"><h2>Cơ hội cần bạn xử lý</h2><p className="hint">Chỉ bàn giao sau khi có phản hồi thật.</p></header>
        {opportunity ? <div className="panel-body"><div className="alert-box alert-amber"><b>{opportunity.businessName}</b><p>Khách hàng cần trao đổi với chuyên viên về nhu cầu website.</p><p className="hint">Bản ghi minh họa trong DEMO. Không có hội thoại CRM thật.</p></div><Button variant="primary" onClick={() => setOpen(true)}>Xem bàn giao →</Button></div> : <EmptyState icon="🤝" title="Chưa có cơ hội cần bàn giao" description="Chưa có dữ liệu hội thoại hoặc cơ hội CRM được lưu." />}
      </section>
    </div>
    <Dialog id="conversation-handoff" className="dialog-wide" open={open} onClose={() => setOpen(false)} title={<span>{opportunity?.businessName || "Bàn giao hội thoại"}<small className="sub" style={{ display: "block" }}>BẢN DEMO · Tương tác chỉ lưu trong phiên trình duyệt</small></span>}>
      <div className="handoff-grid"><section className="panel panPad"><div className="row space"><h3>Lịch sử hội thoại</h3><Button small variant="secondary" onClick={copyTranscript}>{copied ? "Đã sao chép" : "Sao chép"}</Button></div><div className="transcript">{transcript.map((line) => <article className={`message message-${line.role === "Khách hàng" ? "customer" : "bot"}`} key={line.time}><div className="row space"><b>{line.role}</b><time>{line.time}</time></div><p>{line.text}</p></article>)}{note && <article className="message message-note"><div className="row space"><b>Ghi chú nội bộ · DEMO</b><time>09:16</time></div><p>{note}</p></article>}{reply && takenOver && <article className="message message-human"><div className="row space"><b>Chuyên viên · DEMO</b><time>09:18</time></div><p>{reply}</p></article>}</div></section>
      <section className="stack"><div className="panel panPad"><h3>Trạng thái bàn giao</h3><p><Badge tone={takenOver ? "green" : "amber"}>{takenOver ? "Đã nhận trong bản demo" : "Đang chờ người phụ trách"}</Badge></p><p className="hint">Mô phỏng trong trình duyệt; không dừng bot ở Zalo/Facebook.</p><Button variant={takenOver ? "secondary" : "primary"} onClick={() => setTakenOver(true)} disabled={takenOver}>{takenOver ? "Đã nhận bàn giao" : "Nhận bàn giao (DEMO)"}</Button></div><div className="panel panPad"><label className="form-label" htmlFor="handoff-note">Ghi chú nội bộ</label><textarea id="handoff-note" className="form-textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú chỉ lưu trong phiên demo" /></div><div className="panel panPad"><label className="form-label" htmlFor="handoff-reply">Phản hồi minh họa</label><textarea id="handoff-reply" className="form-textarea" value={reply} onChange={(event) => setReply(event.target.value)} disabled={!takenOver} placeholder={takenOver ? "Nhập nội dung demo" : "Nhận bàn giao để bật soạn thử"} /><p className="hint">Nội dung không được gửi ra ngoài.</p></div></section></div>
    </Dialog>
  </>;
}
