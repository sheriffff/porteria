create extension if not exists pgcrypto;

create table players (
  name text primary key,
  pin_hash text,
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key,
  section text not null,
  kind text not null check (kind in ('year', 'yesno', 'gap')),
  text text not null,
  criterion text not null,
  deadline text,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'resolved')),
  resolution text,
  author text references players(name),
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key,
  question_id uuid not null references questions(id) on delete cascade,
  player text not null references players(name),
  value text not null,
  ratio int not null check (ratio >= 1),
  comment text default '',
  change_mind text default '',
  created_at timestamptz not null default now()
);

create table reactions (
  answer_id uuid not null references answers(id) on delete cascade,
  player text not null references players(name),
  emoji text not null,
  primary key (answer_id, player, emoji)
);

create table flags (
  question_id uuid not null references questions(id) on delete cascade,
  player text not null references players(name),
  primary key (question_id, player)
);

alter table players enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table reactions enable row level security;
alter table flags enable row level security;

create policy read_players on players for select using (true);
create policy read_questions on questions for select using (true);
create policy read_answers on answers for select using (true);
create policy read_reactions on reactions for select using (true);
create policy read_flags on flags for select using (true);

create policy add_players on players for insert with check (pin_hash is null);

create or replace function check_pin(p_name text, p_pin text)
returns boolean language plpgsql security definer as $$
declare stored text;
begin
  select pin_hash into stored from players where name = p_name;
  if stored is null then return false; end if;
  return stored = crypt(p_pin, stored);
end; $$;

create or replace function login(p_name text, p_pin text)
returns boolean language plpgsql security definer as $$
declare stored text;
begin
  if p_pin !~ '^\d{4}$' then return false; end if;
  select pin_hash into stored from players where name = p_name;
  if not found then return false; end if;
  if stored is null then
    update players set pin_hash = crypt(p_pin, gen_salt('bf')) where name = p_name;
    return true;
  end if;
  return stored = crypt(p_pin, stored);
end; $$;

create or replace function submit_answer(
  p_name text, p_pin text, p_id uuid, p_question_id uuid,
  p_value text, p_ratio int, p_comment text, p_change_mind text)
returns boolean language plpgsql security definer as $$
begin
  if not check_pin(p_name, p_pin) then raise exception 'PIN incorrecto'; end if;
  if (select status from questions where id = p_question_id) = 'resolved' then
    raise exception 'La pregunta ya está resuelta';
  end if;
  insert into answers (id, question_id, player, value, ratio, comment, change_mind)
  values (p_id, p_question_id, p_name, p_value, p_ratio, coalesce(p_comment, ''), coalesce(p_change_mind, ''));
  return true;
end; $$;

create or replace function propose_question(
  p_name text, p_pin text, p_id uuid, p_section text, p_kind text,
  p_text text, p_criterion text, p_deadline text)
returns boolean language plpgsql security definer as $$
begin
  if not check_pin(p_name, p_pin) then raise exception 'PIN incorrecto'; end if;
  insert into questions (id, section, kind, text, criterion, deadline, status, author)
  values (p_id, p_section, p_kind, p_text, p_criterion, p_deadline, 'proposed', p_name);
  return true;
end; $$;

create or replace function toggle_reaction(
  p_name text, p_pin text, p_answer_id uuid, p_emoji text, p_remove boolean)
returns boolean language plpgsql security definer as $$
begin
  if not check_pin(p_name, p_pin) then raise exception 'PIN incorrecto'; end if;
  if p_remove then
    delete from reactions where answer_id = p_answer_id and player = p_name and emoji = p_emoji;
  else
    insert into reactions (answer_id, player, emoji) values (p_answer_id, p_name, p_emoji)
    on conflict do nothing;
  end if;
  return true;
end; $$;

create or replace function toggle_flag(p_name text, p_pin text, p_question_id uuid, p_remove boolean)
returns boolean language plpgsql security definer as $$
begin
  if not check_pin(p_name, p_pin) then raise exception 'PIN incorrecto'; end if;
  if p_remove then
    delete from flags where question_id = p_question_id and player = p_name;
  else
    insert into flags (question_id, player) values (p_question_id, p_name) on conflict do nothing;
  end if;
  return true;
end; $$;

create or replace function set_question_status(
  p_name text, p_pin text, p_question_id uuid, p_status text, p_resolution text)
returns boolean language plpgsql security definer as $$
begin
  if not check_pin(p_name, p_pin) then raise exception 'PIN incorrecto'; end if;
  if p_name <> 'Sheriff' then raise exception 'Solo el administrador puede hacer esto'; end if;
  update questions set status = p_status, resolution = p_resolution where id = p_question_id;
  return true;
end; $$;

insert into players (name) values ('Jorge'), ('Zango'), ('Sheriff'), ('Pablo');

insert into questions (id, section, kind, text, criterion, deadline, status) values
(gen_random_uuid(), 'Matemáticas', 'year',
 'La Hipótesis de Riemann queda demostrada.',
 'Demostración aceptada por la comunidad matemática: publicada en revista revisada por pares o verificada formalmente.', null, 'active'),
(gen_random_uuid(), 'Matemáticas', 'year',
 'Se resuelve uno de los problemas del milenio del Clay Institute.',
 'El Clay Mathematics Institute reconoce la resolución en su web oficial.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba un tratamiento que frena o revierte el Alzheimer.',
 'Aprobación de la FDA o la EMA en su registro oficial.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba una vacuna contra algún tipo de cáncer.',
 'Aprobación de la FDA o la EMA en su registro oficial.', null, 'active'),
(gen_random_uuid(), 'Generalidad', 'gap',
 'Años entre que se resuelve el 2º y el 7º (y último) problema del milenio.',
 'Años entre la 2ª y la 7ª resolución de la lista, según el Clay Mathematics Institute.', null, 'active'),
(gen_random_uuid(), 'Generalidad', 'gap',
 'Años entre que se resuelve un problema del milenio y que se aprueba un tratamiento que frena el Alzheimer.',
 'Años entre la resolución (Clay) y la aprobación del tratamiento (FDA o EMA).', null, 'active'),
(gen_random_uuid(), 'Generalidad', 'gap',
 'Años entre que se aprueba un tratamiento para el Alzheimer y una vacuna contra el cáncer.',
 'Años entre las dos aprobaciones, en el registro oficial de la FDA o la EMA.', null, 'active'),
(gen_random_uuid(), 'Generalidad', 'year',
 'Año en que se resuelve el último (7º) problema del milenio.',
 'El Clay Mathematics Institute reconoce en su web la resolución del último problema pendiente.', null, 'active'),
(gen_random_uuid(), 'Matemáticas', 'yesno',
 'La Hipótesis de Riemann queda demostrada antes de 2030.',
 'Demostración aceptada por la comunidad matemática antes de 2030.', '2030', 'active'),
(gen_random_uuid(), 'Matemáticas', 'yesno',
 'Se resuelve un problema del milenio del Clay Institute antes de 2030.',
 'El Clay Mathematics Institute lo reconoce en su web antes de 2030.', '2030', 'active'),
(gen_random_uuid(), 'Ciencia', 'yesno',
 'Se aprueba un tratamiento que frena el Alzheimer antes de 2030.',
 'Aprobación de la FDA o la EMA antes de 2030.', '2030', 'active'),
(gen_random_uuid(), 'Matemáticas', 'year',
 'Se demuestra la conjetura de Goldbach.',
 'Cuando la comunidad matemática la dé por demostrada.', null, 'active'),
(gen_random_uuid(), 'Matemáticas', 'year',
 'Se demuestra la conjetura de los primos gemelos.',
 'Cuando la comunidad matemática la dé por demostrada.', null, 'active'),
(gen_random_uuid(), 'Matemáticas', 'year',
 'Se zanja P vs NP.',
 'Cuando haya una demostración aceptada de P = NP o P ≠ NP.', null, 'active'),
(gen_random_uuid(), 'Matemáticas', 'year',
 'El Clay Institute paga por primera vez uno de sus Millennium Prizes.',
 'Cuando el Clay anuncie el pago del premio.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Una central de fusión entrega energía neta a la red eléctrica.',
 'Cuando una planta vierta a la red, de forma sostenida, más energía de la que consume.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se confirma un superconductor a temperatura y presión ambiente.',
 'Cuando haya una réplica independiente aceptada.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Un ordenador cuántico factoriza una clave RSA-2048.',
 'Cuando se publique la factorización.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba una terapia que revierte la parálisis por lesión medular.',
 'Aprobación de la FDA o la EMA.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba una terapia CAR-T para un cáncer sólido frecuente (pulmón, mama, colon o próstata).',
 'Aprobación de la FDA o la EMA.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba un análisis de sangre que detecta pronto la mayoría de los cánceres.',
 'Aprobación de la FDA o la EMA.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba un tratamiento que cura la diabetes tipo 1.',
 'Aprobación de la FDA o la EMA.', null, 'active'),
(gen_random_uuid(), 'Ciencia', 'year',
 'Se aprueba una edición genética in vivo que cura una enfermedad hereditaria.',
 'Aprobación de la FDA o la EMA.', null, 'active');

alter publication supabase_realtime add table questions, answers, reactions, flags;
