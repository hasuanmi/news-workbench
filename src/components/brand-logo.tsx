/**
 * 广州日报官方 logo（透明底，由官方矢量原图处理而来，非临时方块图标）。
 *
 * 使用原生 <img> 直连 public/brand 下的静态资源，不走 Next 图片优化器：
 * 本项目未安装 sharp，优化器不可用会导致 logo 渲染为 0×0 破图。
 *
 * variant="full"  完整 logo：标志 +「广州日报」书法字 —— 登录页等品牌展示位
 * variant="mark"  仅标志：弧线 + 球体            —— 侧边栏 / 页头等紧凑位置
 */
export function BrandLogo({
  variant = "mark",
  height = 32,
  className,
}: {
  variant?: "full" | "mark";
  /** 显示高度（px），宽度按 logo 原始比例自动推导 */
  height?: number;
  className?: string;
}) {
  const isFull = variant === "full";
  // 由官方 SVG 输出：full 裁剪为横向 620×200，mark 为正方形 240×240
  const ratio = isFull ? 620 / 200 : 240 / 240;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isFull ? "/brand/logo-full.png" : "/brand/logo-mark.png"}
      alt="广州日报"
      width={Math.round(height * ratio)}
      height={height}
      decoding="async"
      className={className}
      style={{ width: "auto", height }}
    />
  );
}
