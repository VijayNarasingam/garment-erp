package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Supplier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

    List<Supplier> findByBusinessIdOrderByNameAsc(Long businessId);

    Optional<Supplier> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndCodeIgnoreCase(Long businessId, String code);

    long countByBusinessId(Long businessId);

    @Query("""
            select s from Supplier s
            where s.business.id = :businessId
              and (:active is null or s.active = :active)
              and (:q is null or lower(s.name) like lower(concat('%', :q, '%'))
                   or lower(s.code) like lower(concat('%', :q, '%'))
                   or s.phone like concat('%', :q, '%'))
            order by s.name
            """)
    Page<Supplier> search(@Param("businessId") Long businessId, @Param("q") String q,
                          @Param("active") Boolean active, Pageable pageable);
}
