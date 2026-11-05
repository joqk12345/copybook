import { PDFDocument, PDFName, PDFHexString, StandardFonts } from 'pdf-lib';
/** Small synthetic text-layer PDF: no personal content or third-party font assets. */
export async function annotatedPDF() {
  const doc=await PDFDocument.create(),page=doc.addPage([595.28,841.89]);
  const cmap=`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Test def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar <0001> <5988> <0002> <4EEC> endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`;
  const ctx=doc.context,unicode=ctx.register(ctx.stream(cmap));
  const descriptor=ctx.register(ctx.obj({Type:'FontDescriptor',FontName:'TestFont',Flags:4,FontBBox:[0,0,1000,1000],Ascent:1000,Descent:0,CapHeight:1000,ItalicAngle:0,StemV:80}));
  const cid=ctx.register(ctx.obj({Type:'Font',Subtype:'CIDFontType2',BaseFont:'TestFont',CIDSystemInfo:{Registry:PDFHexString.fromText('Adobe'),Ordering:PDFHexString.fromText('Identity'),Supplement:0},FontDescriptor:descriptor,DW:1000}));
  const font=ctx.register(ctx.obj({Type:'Font',Subtype:'Type0',BaseFont:'TestFont',Encoding:'Identity-H',DescendantFonts:[cid],ToUnicode:unicode}));
  const resources=page.node.Resources()!;resources.set(PDFName.of('Font'),ctx.obj({FTest:font}));
  const helvetica=await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('ma',{x:76,y:628,size:12,font:helvetica});page.drawText('men',{x:113,y:628,size:12,font:helvetica});
  page.node.addContentStream(ctx.register(ctx.stream('BT /FTest 24 Tf 1 0 0 1 112 600 Tm <0002> Tj 1 0 0 1 72 600 Tm <0001> Tj ET')));
  doc.addPage([595.28,841.89]);
  return Buffer.from(await doc.save());
}
