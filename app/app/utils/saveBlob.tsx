export function saveBlobToLocalStorage(blob: Blob, keyName: string): void {
  const reader = new FileReader();

  reader.onloadend = function () {
    // Use type assertion to ensure TypeScript knows this is a string
    const base64String: string = reader.result as string;

    // Save the Base64 encoded blob data to local storage
    localStorage.setItem(keyName, base64String);
  };

  reader.readAsDataURL(blob);
}

export function loadBlobFromLocalStorage() {
  const base64Data = localStorage.getItem("previewIPFS");
  if (!base64Data) {
    console.error("No data found in local storage.");
    return;
  }

  const byteCharacters = atob(base64Data.split(",")[1]);
  const byteNumbers = Array.from(byteCharacters).map((char) =>
    char.charCodeAt(0)
  );
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "image/png" });
  return blob;
}
