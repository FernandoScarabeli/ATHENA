import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateFolderDto, CreateRequirementDto, UpdateFolderDto, UpdateRequirementDto, validTipTap } from '../src/requirements/dto';

describe('CreateRequirementDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const transform = (value: object) => pipe.transform(value, {
    type: 'body',
    metatype: CreateRequirementDto,
  });

  it('preserva o conteúdo TipTap durante o whitelist', async () => {
    const content = { type: 'doc', content: [] };

    const dto = await transform({ title: 'Criar requisito', content, folderId: '00000000-0000-4000-8000-000000000001' });

    expect(dto).toBeInstanceOf(CreateRequirementDto);
    expect(dto.content).toEqual(content);
  });

  it('usa objeto vazio quando content não é enviado', async () => {
    const dto = await transform({ title: 'Criar requisito', folderId: '00000000-0000-4000-8000-000000000001' });

    expect(dto.content).toEqual({});
  });
  it('rejeita marks desconhecidas e links fora dos protocolos permitidos', async () => {
    await expect(transform({ title: 'x', folderId: '00000000-0000-4000-8000-000000000001', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'unknown' }] }] }] } })).rejects.toThrow();
    await expect(transform({ title: 'x', folderId: '00000000-0000-4000-8000-000000000001', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } })).rejects.toThrow();
  });
  it('aceita tabelas TipTap com atributos seguros', () => {
    expect(validTipTap({ type:'doc', content:[{ type:'table', content:[{ type:'tableRow', attrs:{backgroundColor:'#F3F4F6'}, content:[{ type:'tableHeader', attrs:{colspan:1,rowspan:1,colwidth:null}, content:[{type:'paragraph',content:[{type:'text',text:'Campo'}]}] }] }] }] })).toBe(true);
  });
  it('aceita texto sublinhado produzido pela extensão comunitária', () => {
    expect(validTipTap({ type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text:'Importante', marks:[{type:'underline'}] }] }] })).toBe(true);
  });
  it('aceita a formatação de documento do editor', () => {
    expect(validTipTap({ type:'doc', content:[{ type:'paragraph', attrs:{ textAlign:'justify' }, content:[{ type:'text', text:'Destaque', marks:[{ type:'textStyle', attrs:{ fontFamily:'Georgia', fontSize:'18px', color:'#123456', backgroundColor:'#fff2a8' } }] }] }] })).toBe(true);
  });
  it('rejeita valores de estilo fora da política do produto', () => {
    expect(validTipTap({ type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text:'x', marks:[{ type:'textStyle', attrs:{ fontSize:'13px' } }] }] }] })).toBe(false);
    expect(validTipTap({ type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text:'x', marks:[{ type:'textStyle', attrs:{ color:'red' } }] }] }] })).toBe(false);
    expect(validTipTap({ type:'doc', content:[{ type:'paragraph', attrs:{ textAlign:'start' }, content:[] }] })).toBe(false);
  });
  it('rejeita propriedades desconhecidas em nós e marks', () => {
    expect(validTipTap({ type:'doc', content:[], dataTest:'injetado' })).toBe(false);
    expect(validTipTap({ type:'doc', content:[{ type:'paragraph', content:[{ type:'text', text:'x', marks:[{ type:'bold', attrs:{class:'unsafe'} }] }] }] })).toBe(false);
  });
  it('rejeita atributos e cores de tabela não permitidos', () => {
    expect(validTipTap({ type:'doc', content:[{ type:'table', attrs:{style:'color:red'}, content:[] }] })).toBe(false);
    expect(validTipTap({ type:'doc', content:[{ type:'tableRow', attrs:{backgroundColor:'url(javascript:alert(1))'}, content:[] }] })).toBe(false);
  });
  it('aceita PATCH sem type e remove campos imutáveis', async () => {
    const dto = await pipe.transform({
      revision: 3,
      title: 'Título revisado',
      content: { type: 'doc', content: [] },
      source: 'IMPORTADO',
    }, { type: 'body', metatype: UpdateRequirementDto });

    expect(dto).toBeInstanceOf(UpdateRequirementDto);
    expect(dto).toMatchObject({ revision: 3, title: 'Título revisado' });
    expect(dto).not.toHaveProperty('type');
    expect(dto).not.toHaveProperty('source');
  });
});

describe('Folder DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it('rejects blank names at the HTTP validation boundary', async () => {
    await expect(pipe.transform({ name: '   ' }, { type: 'body', metatype: CreateFolderDto })).rejects.toThrow();
    await expect(pipe.transform({ name: '\t' }, { type: 'body', metatype: UpdateFolderDto })).rejects.toThrow();
  });
});
