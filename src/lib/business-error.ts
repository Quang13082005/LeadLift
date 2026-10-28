import { ZodError } from "zod";

export class BusinessError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); }
}

/** Never return driver errors, connection details or raw input to the client. */
export function publicBusinessError(error: unknown): { message: string; status: number } {
  if (error instanceof BusinessError) return { message: error.message, status: error.statusCode };
  if (error instanceof ZodError) return { message: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "), status: 400 };
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "P2002") return { message: "Tên miền đã tồn tại. Vui lòng kiểm tra hồ sơ trước khi lưu.", status: 409 };
  if (code === "P2025") return { message: "Không tìm thấy doanh nghiệp cần cập nhật.", status: 404 };
  return { message: "Không thể truy cập dữ liệu doanh nghiệp. Vui lòng thử lại.", status: 503 };
}
