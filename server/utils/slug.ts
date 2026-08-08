export function generateSlug(title: string): string {
  // Baju Anak 2 Tahun Xl
  return title
    .toLowerCase() // baju anak 2 tahun
    .trim() // baju anak 2 tahun
    .replace(/^-+|-+$/g, "") //
    .replace(/[^a-z0-9]+/g, "-"); // baju-anak-2-tahun
}

export async function createUniqueSlug(
  input: string,
  existsFn: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = generateSlug(input);
  let counter = 1;

  // Kalau slug sudah dipakai, tambahkan angka suffix: nama-produk-1, nama-produk-2, ...
  while (await existsFn(slug)) {
    slug = `${generateSlug(input)}-${counter}`;
    counter++;
  }

  return slug;
}
