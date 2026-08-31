import { redirect } from "next/navigation";

/** Photo import lives on Import products — keep old URL working. */
export default function FromPhotoPage() {
  redirect("/products/import");
}
