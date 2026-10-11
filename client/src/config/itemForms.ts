import type { Category, ItemDetails } from '../types/domain'

export interface DetailField {
  key: keyof ItemDetails
  label: string
  kind: 'text' | 'number' | 'choice'
  placeholder?: string
  options?: string[]
}
interface ItemForm {
  placeholder: string
  fields: DetailField[]
  expires: boolean
  opened: boolean
  note: string
}
const brand: DetailField = { key: 'brand', label: '品牌 / 系列（选填）', kind: 'text', placeholder: '例如：品牌及系列名称' }
const pieces: DetailField = { key: 'piecesPerPack', label: '每包片数（选填）', kind: 'number', placeholder: '按包装填写，例如 52' }

export const itemForms: Record<Category, ItemForm> = {
  formula: {
    placeholder: '例如：日常喝的奶粉', expires: true, opened: true,
    fields: [brand,
      { key: 'stage', label: '段数（选填）', kind: 'choice', options: ['1段', '2段', '3段', '4段', '特殊配方', '其他'] },
      { key: 'netWeightGrams', label: '每罐净含量 / g（选填）', kind: 'number', placeholder: '按包装填写，例如 800' }],
    note: '按罐输入需填写每罐克数，半罐可填 0.5；按克记录更准确。不同开封日期或批次分开记录，开封后期限以包装说明为准。',
  },
  diapers: {
    placeholder: '例如：日常用的纸尿裤', expires: true, opened: false,
    fields: [brand,
      { key: 'size', label: '尺码（选填）', kind: 'choice', options: ['NB', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '其他'] }, pieces],
    note: '库存按片记录；填写每包片数后可按整包补货。不同尺码、片数或批次分开记录。',
  },
  feeding: {
    placeholder: '例如：奶瓶、奶嘴、储奶袋', expires: false, opened: false,
    fields: [brand, { key: 'capacityMl', label: '容量 / ml（选填）', kind: 'number', placeholder: '例如 240' },
      { key: 'material', label: '材质（选填）', kind: 'text', placeholder: '例如：玻璃、PPSU、硅胶' }],
    note: '奶瓶、奶嘴等可重复使用用品，仅在丢失、淘汰或移出时减少库存，不按每次使用扣减。',
  },
  cleaning: {
    placeholder: '例如：湿巾、棉柔巾', expires: true, opened: true,
    fields: [brand, pieces], note: '单位可按片或包填写；不同规格分开记录，开封后期限以包装说明为准。',
  },
  care: {
    placeholder: '例如：洗护、护肤用品', expires: true, opened: true,
    fields: [brand, { key: 'volumeMl', label: '每件容量 / ml（选填）', kind: 'number', placeholder: '例如 200' }],
    note: '记录有效期与开封日期；开封后的使用期限以产品包装说明为准。',
  },
  clothing: {
    placeholder: '例如：连体衣、袜子、围兜', expires: false, opened: false,
    fields: [{ key: 'size', label: '尺码（选填）', kind: 'text', placeholder: '例如：66、73、80' }],
    note: '不同尺码分开记录；仅在送出、淘汰或移出时减少库存。',
  },
  travel: {
    placeholder: '例如：背带、推车配件', expires: false, opened: false,
    fields: [brand, { key: 'model', label: '型号 / 规格（选填）', kind: 'text', placeholder: '例如：型号、适配款式' }],
    note: '记录型号和存放位置；可重复使用用品不按每次使用扣减。',
  },
  other: { placeholder: '填写用品名称', fields: [], expires: true, opened: true, note: '按实际用途选择计量单位，不同规格或日期分开记录。' },
}
