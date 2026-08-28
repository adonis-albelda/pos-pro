import { GitMerge, Package, Warehouse } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui";

export function ImportInfoCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader icon={GitMerge} title="Matching" />
        <CardBody className="text-body text-ink-muted">
          Rows match existing products by <span className="font-medium text-ink">SKU</span>. Same
          SKU updates that product. A new SKU adds a new product.
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={Package} title="What changes" />
        <CardBody className="text-body text-ink-muted">
          Name, price, cost, category, supplier, and reorder point come from your file. A{" "}
          <span className="font-medium text-ink">blank cell keeps the current value</span> on that
          product — nothing is wiped to zero by accident.
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={Warehouse} title="Stock" />
        <CardBody className="text-body text-ink-muted">
          Optional. Skip stock, set branch quantity from the file, or add file quantity to what you
          already have. Only affects the branch you choose.
        </CardBody>
      </Card>
    </div>
  );
}
